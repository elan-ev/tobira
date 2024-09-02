use std::{time::{Duration, Instant}, fmt};

use deadpool_postgres::ClientWrapper;
use meilisearch_sdk::{
    client::Client as MeiliClient,
    indexes::Index,
    tasks::Task,
    errors::ErrorCode, task_info::TaskInfo,
};
use postgres_types::{FromSql, ToSql};
use secrecy::{Secret, ExposeSecret};
use serde::{Deserialize, Serialize};

use crate::{
    db::types::Key,
    prelude::*,
    config::HttpHost,
};

pub(crate) mod cmd;
mod event;
mod meta;
mod realm;
mod series;
pub(crate) mod writer;
mod update;
mod user;
mod util;
mod playlist;

use self::writer::MeiliWriter;
pub(crate) use self::{
    event::Event,
    meta::IndexState,
    realm::Realm,
    series::Series,
    update::{update_index, update_index_daemon},
    user::User,
    playlist::Playlist,
};


/// The version of search index schema. Increase whenever there is a change that
/// requires an index rebuild.
const VERSION: u32 = 6;


// ===== Configuration ============================================================================

#[derive(Debug, Clone, confique::Config)]
pub(crate) struct MeiliConfig {
    /// The access key. This can be the master key, but ideally should be an API
    /// key that only has the priviliges it needs.
    key: Secret<String>,

    /// The host MeiliSearch is running on. As requests include the `key`, you
    /// should use HTTPS if Meili is running on another machine. In fact, HTTP
    /// is disallowed unless the host resolves to a loopback address.
    #[config(default = "http://127.0.0.1:7700")]
    host: HttpHost,

    /// A prefix for index names in Meili. Useful only to avoid collision if
    /// other services use Meili as well.
    #[config(default = "tobira_")]
    index_prefix: String,

    /// How often DB changes are written back to the search index.
    #[config(default = "5s", deserialize_with = crate::config::deserialize_duration)]
    update_interval: Duration,
}

impl MeiliConfig {
    /// Connects to Meili, erroring if Meili is not reachable. Does not check
    /// whether required indexes exist or whether they are in the correct shape!
    pub(crate) async fn connect(&self) -> Result<Client> {
        let client = Client::new(self.clone());
        client.check_connection().await
            .with_context(|| format!("failed to connect to MeiliSearch at '{}'", self.host))?;

        info!("Connected to MeiliSearch at '{}'", self.host);

        Ok(client)
    }

    fn meta_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "meta")
    }

    fn event_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "events")
    }

    fn series_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "series")
    }

    fn realm_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "realms")
    }

    fn user_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "users")
    }

    fn playlist_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "playlists")
    }
}


// ===== Client ===================================================================================

/// Search index client: the entry point to communicate with the search index.
///
/// Note that any operations that change the index should be done through
/// `write::with_write_lock`! See its documentation for more detail.
#[derive(Clone)]
pub(crate) struct Client {
    config: MeiliConfig,
    pub(crate) client: MeiliClient,
    pub(crate) meta_index: Index,
    pub(crate) event_index: Index,
    pub(crate) series_index: Index,
    pub(crate) realm_index: Index,
    pub(crate) user_index: Index,
    pub(crate) playlist_index: Index,
}

impl Client {
    /// Creates the search client, but without contacting Meili at all. Thus,
    /// neither the connection nor the existence of the indexes is checked.
    /// Also see [`Self::check_connection`] and [`Self::prepare`].
    pub(crate) fn new(config: MeiliConfig) -> Self {
        // Create client (this does not connect to Meili).
        let client = MeiliClient::new(
            &config.host.to_string(),
            Some(config.key.expose_secret()),
        );

        // Store some references to the indices (without checking whether they
        // actually exist!).
        let meta_index = client.index(&config.meta_index_name());
        let event_index = client.index(&config.event_index_name());
        let series_index = client.index(&config.series_index_name());
        let realm_index = client.index(&config.realm_index_name());
        let user_index = client.index(&config.user_index_name());
        let playlist_index = client.index(&config.playlist_index_name());

        Self {
            client,
            config,
            meta_index,
            event_index,
            series_index,
            realm_index,
            user_index,
            playlist_index,
        }
    }

    /// Checks the connection to Meilisearch by accessing the `/health` endpoint.
    pub(crate) async fn check_connection(&self) -> Result<()> {
        if let Err(e) = self.client.health().await {
            bail!("Cannot reach MeiliSearch: {e}");
        }

        if !self.client.is_healthy().await {
            bail!("MeiliSearch instance is not healthy or not reachable");
        }

        Ok(())
    }

    /// Makes sure all required indexes exist and have the right options set.
    /// Also rebuilds the whole search index if it is necessary due to a schema
    /// version mismatch.
    pub(crate) async fn prepare_and_rebuild_if_necessary(
        &self,
        db: &mut ClientWrapper,
    ) -> Result<()> {
        writer::with_write_lock(db, self, |tx, meili| Box::pin(async move {
            prepare_indexes(&meili).await.context("failed to prepare search indexes")?;
            rebuild_if_necessary(&meili, tx).await
        })).await
    }
}


// ===== Abstracting over search items ============================================================

#[derive(Debug, Clone, Copy, FromSql, ToSql, PartialEq, Eq, Hash)]
#[postgres(name = "search_index_item_kind")]
pub(crate) enum IndexItemKind {
    #[postgres(name = "realm")]
    Realm,
    #[postgres(name = "event")]
    Event,
    #[postgres(name = "series")]
    Series,
    #[postgres(name = "user")]
    User,
    #[postgres(name = "playlist")]
    Playlist,
}

impl IndexItemKind {
    fn plural_name(self) -> &'static str {
        match self {
            IndexItemKind::Realm => "realms",
            IndexItemKind::Event => "events",
            IndexItemKind::Series => "series",
            IndexItemKind::User => "user",
            IndexItemKind::Playlist => "playlist",
        }
    }
}

pub(crate) trait IndexItem: serde::Serialize {
    const KIND: IndexItemKind;
    fn id(&self) -> SearchId;
}


// ===== `SearchId` ===============================================================================

/// Wrapper type for our primary ID that serializes and deserializes as base64
/// encoded string.
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, FromSql)]
#[serde(try_from = "&str", into = "String")]
#[postgres(transparent)]
pub(crate) struct SearchId(pub(crate) Key);

impl TryFrom<&str> for SearchId {
    type Error = &'static str;
    fn try_from(src: &str) -> Result<Self, Self::Error> {
        Key::from_base64(src)
            .ok_or("invalid base64 encoded ID")
            .map(Self)
    }
}

impl From<SearchId> for String {
    fn from(src: SearchId) -> Self {
        src.to_string()
    }
}

impl fmt::Display for SearchId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut out = [0; 11];
        self.0.to_base64(&mut out).fmt(f)
    }
}

impl fmt::Debug for SearchId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SearchId({:?})", self.0)
    }
}


// ===== Various functions ========================================================================

/// Makes sure that all required indexes exist and have the correct settings.
pub(crate) async fn prepare_indexes(meili: &MeiliWriter<'_>) -> Result<()> {
    /// Creates a new index with the given `name` if it does not exist yet.
    async fn create_index(client: &MeiliClient, name: &str) -> Result<Index> {
        debug!("Trying to create Meili index '{name}' if it doesn't exist yet");
        let task = client.create_index(name, Some("id"))
            .await?
            .wait_for_completion(&client, None, None)
            .await?;

        let index = match task {
            Task::Enqueued { .. } | Task::Processing { .. }
                => unreachable!("waited for task to complete, but it is not"),
            Task::Failed { content } => {
                if content.error.error_code == ErrorCode::IndexAlreadyExists {
                    debug!("Meili index '{name}' already exists");
                    client.index(name)
                } else {
                    bail!("Failed to create Meili index '{}': {:#?}", name, content.error);
                }
            }
            Task::Succeeded { .. } => {
                info!("Created Meili index '{name}'");
                task.try_make_index(&client).unwrap()
            }
        };

        Ok(index)
    }


    create_index(&meili.client, &meili.config.meta_index_name()).await?;

    let event_index = create_index(&meili.client, &meili.config.event_index_name()).await?;
    event::prepare_index(&event_index).await?;

    let series_index = create_index(&meili.client, &meili.config.series_index_name()).await?;
    series::prepare_index(&series_index).await?;

    let realm_index = create_index(&meili.client, &meili.config.realm_index_name()).await?;
    realm::prepare_index(&realm_index).await?;

    let user_index = create_index(&meili.client, &meili.config.user_index_name()).await?;
    user::prepare_index(&user_index).await?;

    let playlist_index = create_index(&meili.client, &meili.config.playlist_index_name()).await?;
    playlist::prepare_index(&playlist_index).await?;

    debug!("All Meili indexes exist and are ready");

    Ok(())
}

/// Checks the current schema version of the search index and if it is
/// incompatible, rebuilds the index.
pub(crate) async fn rebuild_if_necessary(
    meili: &MeiliWriter<'_>,
    tx: &deadpool_postgres::Transaction<'_>,
) -> Result<()> {
    let state = IndexState::fetch(&meili.meta_index).await?;
    if state.needs_rebuild() {
        info!(
            search_index_state = ?state,
            expected_version = VERSION,
            "Search index schema incompatible -> will rebuild search index",
        );

        meili.meta_index.add_or_replace(&[meta::Meta::current_dirty()], None).await
            .context("failed to update index version document (dirty)")?;

        let tasks = rebuild(meili, tx).await?;
        info!("Waiting for Meili to finish indexing");
        for task in tasks {
            util::wait_on_task(task, meili).await?;
        }
        info!("Completely rebuild search index");

        meili.meta_index.add_or_replace(&[meta::Meta::current_clean()], None).await
            .context("failed to update index version document (clean)")?;
    } else {
        info!("Search index schema is up to date (version: {VERSION}) -> no rebuild needed");

        // Reindex is not required, but the version isn't stored explicitly. So
        // we do that now.
        if state == IndexState::NoVersionInfo {
            meili.meta_index.add_or_replace(&[meta::Meta::current_clean()], None).await
                .context("failed to update index version document (clean)")?;
        }
    }

    Ok(())
}

/// Deletes all indexes (used by Tobira) including all their data! If any index
/// does not exist, this function just does nothing.
pub(crate) async fn clear(meili: &MeiliWriter<'_>) -> Result<()> {
    use meilisearch_sdk::errors::Error;
    let ignore_missing_index = |res: Result<TaskInfo, Error>| -> Result<(), Error> {
        match res {
            Ok(_) => Ok(()),
            Err(e) if util::is_index_not_found(&e) => Ok(()),
            Err(e) => Err(e),
        }
    };

    ignore_missing_index(meili.meta_index.clone().delete().await)?;
    ignore_missing_index(meili.event_index.clone().delete().await)?;
    ignore_missing_index(meili.series_index.clone().delete().await)?;
    ignore_missing_index(meili.realm_index.clone().delete().await)?;
    ignore_missing_index(meili.user_index.clone().delete().await)?;
    ignore_missing_index(meili.playlist_index.clone().delete().await)?;

    info!("Deleted search indexes");
    Ok(())
}

/// Loads all data from the DB and adding it to the index. Old entries that are
/// in the index, but not in the DB anymore, are not removed. Thus, to cleanly
/// rebuild, clear all indexes before.
pub(crate) async fn index_all_data(
    meili: &MeiliWriter<'_>,
    tx: &deadpool_postgres::Transaction<'_>,
) -> Result<Vec<TaskInfo>> {
    let mut tasks = Vec::new();

    macro_rules! rebuild_index {
        ($plural:literal, $ty:ty, $index:expr) => {
            let items = <$ty>::load_all(&**tx).await?;
            debug!("Loaded {} {} from DB", items.len(), $plural);

            if items.is_empty() {
                debug!("No {} in the DB -> Not sending anything to Meili", $plural);
            } else {
                let task = $index.add_documents(&items, None).await?;
                debug!("Sent {} {} to Meili for indexing", items.len(), $plural);
                tasks.push(task);
            }
        }
    }

    let before = Instant::now();
    rebuild_index!("events", Event, meili.event_index);
    rebuild_index!("series", Series, meili.series_index);
    rebuild_index!("realms", Realm, meili.realm_index);
    rebuild_index!("users", User, meili.user_index);
    rebuild_index!("playlists", Playlist, meili.playlist_index);
    info!("Sent all data to Meili in {:.1?}", before.elapsed());

    // We can clear the search index queue as we just sent all items to Meili.
    // This is all in one DB transaction and we submitted all data to Meili.
    tx.execute("delete from search_index_queue", &[]).await
        .context("failed to clear search index queue")?;
    info!("Cleared search index queue");

    Ok(tasks)
}

/// Clears and then rebuilds all indexes. It's `clear` + `prepare_indexes` +
/// `index_all_data`.
pub(crate) async fn rebuild(
    meili: &MeiliWriter<'_>,
    tx: &deadpool_postgres::Transaction<'_>,
) -> Result<Vec<TaskInfo>> {
    clear(meili).await.context("failed to clear index")?;
    prepare_indexes(meili).await.context("failed to prepare search indexes")?;
    index_all_data(meili, tx).await.context("failed to index all data")
}
