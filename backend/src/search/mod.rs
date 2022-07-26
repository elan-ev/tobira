use std::{time::{Duration, Instant}, fmt};

use meilisearch_sdk::{
    client::Client as MeiliClient,
    indexes::Index,
    tasks::Task,
    errors::ErrorCode,
};
use postgres_types::{FromSql, ToSql};
use secrecy::{Secret, ExposeSecret};
use serde::{Deserialize, Serialize};

use crate::{
    db::{DbConnection, types::Key},
    prelude::*,
    util::HttpHost,
};

pub(crate) mod cmd;
mod event;
mod realm;
mod writer;
mod update;
mod util;

pub(crate) use self::{
    event::Event,
    realm::Realm,
    update::{update_index, update_index_daemon},
};

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
    /// Connects to Meili, tests the connections and prepares all indexes.
    pub(crate) async fn connect_and_prepare(&self, db: &mut DbConnection) -> Result<Client> {
        let client = Client::new(self.clone()).await
            .with_context(|| format!("failed to connect to MeiliSearch at '{}'", self.host))?;

        client.prepare(db).await?;

        Ok(client)
    }

    /// Connects to Meili, but does not check whether required indexes exist or
    /// are in the correct shape!
    pub(crate) async fn connect_only(&self) -> Result<Client> {
        Client::new(self.clone()).await
            .with_context(|| format!("failed to connect to MeiliSearch at '{}'", self.host))
    }

    fn event_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "events")
    }

    fn realm_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "realms")
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
    client: MeiliClient,
    pub(crate) event_index: Index,
    pub(crate) realm_index: Index,
}

impl Client {
    /// Creates a new connection to Meili, makes sure that Meili is healthy and
    /// creates an instance of `Self`. The `Index` fields in `Self` are only
    /// references and it is NOT checked whether these indexes actually exist
    /// or are in the right form. So in most situations, you also want to call
    /// `prepare` to make sure Meili is ready to be used.
    async fn new(config: MeiliConfig) -> Result<Self> {
        let client = MeiliClient::new(
            &config.host.to_string(),
            config.key.expose_secret(),
        );

        if let Err(e) = client.health().await {
            bail!("Cannot reach MeiliSearch: {e}");
        }

        if !client.is_healthy().await {
            bail!("MeiliSearch instance is not healthy or not reachable");
        }

        info!("Connected to MeiliSearch at '{}'", config.host);

        // Store some references to the indices (without checking whether they
        // actually exist!).
        let event_index = client.index(&config.event_index_name());
        let realm_index = client.index(&config.realm_index_name());

        Ok(Self { client, config, event_index, realm_index })
    }

    /// Makes sure that all required indexes exist and are in the correct shape.
    /// If they are not, this function attempts to fix that.
    async fn prepare(&self, db: &mut DbConnection) -> Result<()> {
        /// Creates a new index with the given `name` if it does not exist yet.
        async fn create_index(client: &MeiliClient, name: &str) -> Result<Index> {
            debug!("Trying to creating Meili index '{name}' if it doesn't exist yet");
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
                    debug!("Created Meili index '{name}'");
                    task.try_make_index(&client).unwrap()
                }
            };

            Ok(index)
        }

        writer::with_write_lock(db, self, |_tx, meili| Box::pin(async move {
            let event_index = create_index(&meili.client, &meili.config.event_index_name()).await?;
            event::prepare_index(&event_index).await?;

            let realm_index = create_index(&meili.client, &meili.config.realm_index_name()).await?;
            realm::prepare_index(&realm_index).await?;

            debug!("All Meili indexes exist and are ready");

            Ok(())
        })).await?;

        Ok(())
    }
}


// ===== Abstracting over search items ============================================================

#[derive(Debug, Clone, Copy, FromSql, ToSql, PartialEq, Eq)]
#[postgres(name = "search_index_item_kind")]
pub(crate) enum IndexItemKind {
    #[postgres(name = "realm")]
    Realm,
    #[postgres(name = "event")]
    Event,
}

impl IndexItemKind {
    fn plural_name(self) -> &'static str {
        match self {
            IndexItemKind::Realm => "realms",
            IndexItemKind::Event => "events",
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


/// Deletes all indexes (used by Tobira) including all their data! If any index
/// does not exist, this function just does nothing.
pub(crate) async fn clear(meili: Client) -> Result<()> {
    use meilisearch_sdk::errors::Error;
    let ignore_missing_index = |res: Result<Task, Error>| -> Result<(), Error> {
        match res {
            Ok(_) => Ok(()),
            Err(e) if util::is_index_not_found(&e) => Ok(()),
            Err(e) => Err(e),
        }
    };

    ignore_missing_index(meili.event_index.delete().await)?;
    ignore_missing_index(meili.realm_index.delete().await)?;

    info!("Deleted search indexes");
    Ok(())
}

/// Rebuilds all indexes by loading all data from the DB and adding it to the
/// index. Old entries that are in the index, but not in the DB anymore, are
/// not removed. Thus, to cleanly rebuild, clear all indexes before.
pub(crate) async fn rebuild_index(meili: &Client, db: &mut DbConnection) -> Result<()> {
    let before = Instant::now();
    let tasks = writer::with_write_lock(db, meili, |tx, meili| Box::pin(async move {
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

        rebuild_index!("events", Event, meili.event_index);
        rebuild_index!("realms", Realm, meili.realm_index);

        Ok(tasks)
    })).await?;

    info!("Sent all data to Meili in {:.1?}", before.elapsed());


    info!("Waiting for Meili to complete indexing...\n\
        (note: you may ctrl+c this command now -- this won't stop indexing)");
    let before = Instant::now();
    for task in tasks {
        util::wait_on_task(task, meili).await?;
    }

    info!("Meili finished indexing in {:.1?}", before.elapsed());

    Ok(())
}
