use std::{time::Duration, fmt};

use futures::pin_mut;
use meilisearch_sdk::{
    client::Client as MeiliClient,
    indexes::Index,
    tasks::Task,
    errors::ErrorCode,
};
use postgres_types::{FromSql, ToSql};
use secrecy::{Secret, ExposeSecret};
use serde::{Deserialize, Serialize};
use tokio_postgres::binary_copy::BinaryCopyInWriter;

use crate::{
    auth::ROLE_ADMIN,
    db::{DbConnection, types::Key},
    prelude::*,
    util::HttpHost,
};

pub(crate) mod cmd;
mod event;
mod realm;
mod writer;
mod update;

pub(crate) use self::{
    event::Event,
    realm::Realm,
    update::{update_index, update_index_daemon},
};


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
    pub(crate) async fn connect(&self) -> Result<Client> {
        Client::new(self.clone()).await
            .with_context(|| format!("failed to connect to MeiliSearch at '{}'", self.host))
    }

    pub(crate) fn validate(&self) -> Result<()> {
        self.host.assert_safety().context("failed to validate 'meili.host'")?;
        Ok(())
    }

    fn event_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "events")
    }

    fn realm_index_name(&self) -> String {
        format!("{}{}", self.index_prefix, "realms")
    }
}

pub(crate) struct Client {
    config: MeiliConfig,
    client: MeiliClient,
    pub(crate) event_index: Index,
    pub(crate) realm_index: Index,
}

impl Client {
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

        // Preparing the indexes.
        let event_index = create_index(&client, &config.event_index_name()).await?;
        event::prepare_index(&event_index).await?;
        let realm_index = create_index(&client, &config.realm_index_name()).await?;
        realm::prepare_index(&realm_index).await?;
        debug!("All required Meili indexes exist (they might be empty though)");

        Ok(Self { client, config, event_index, realm_index })
    }
}

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

pub(crate) trait IndexItem: meilisearch_sdk::document::Document<UIDType = SearchId> {
    const KIND: IndexItemKind;

    fn id(&self) -> SearchId {
        *self.get_uid()
    }
}

/// Adds many items to the "search index queue" to mark them as "needs update in
/// index".
pub(crate) async fn queue_many(
    db: &tokio_postgres::Transaction<'_>,
    items: impl IntoIterator<Item = (Key, IndexItemKind)>,
) -> Result<()> {
    // Here we prepare a dummy statement in order to acquire the `Type`s of the
    // both fields.
    let statement = db
        .prepare("insert into search_index_queue (item_id, kind) values ($1, $2)")
        .await?;
    let id_type = statement.params()[0].clone();
    let kind_type = statement.params()[1].clone();

    // We insert the data via `COPY IN`, one of the fastest ways to bulk insert.
    let sink = db.copy_in("copy search_index_queue (item_id, kind) from stdin binary").await?;
    let writer = BinaryCopyInWriter::new(sink, &[id_type, kind_type]);
    pin_mut!(writer);
    for (id, kind) in items {
        writer.as_mut().write(&[&id, &kind]).await?;
    }
    writer.finish().await?;

    Ok(())
}

// Creates a new index with the given `name` if it does not exist yet.
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

/// Deletes all indexes (used by Tobira) including all their data!
pub(crate) async fn clear(meili: Client) -> Result<()> {
    meili.event_index.delete().await?;
    meili.realm_index.delete().await?;

    info!("Deleted search indexes");
    Ok(())
}

// Helper function to only set special attributes when they are not correctly
// set yet. Unfortunately Meili seems to perform lots of work when setting
// them, even if the special attribute set was the same before.
async fn lazy_set_special_attributes(
    index: &Index,
    index_name: &str,
    searchable_attrs: &[&str],
    filterable_attrs: &[&str],
) -> Result<()> {
    if index.get_searchable_attributes().await? != searchable_attrs {
        debug!("Updating `searchable_attributes` of {index_name} index");
        index.set_searchable_attributes(searchable_attrs).await?;
    }

    if index.get_filterable_attributes().await? != filterable_attrs {
        debug!("Updating `filterable_attributes` of {index_name} index");
        index.set_filterable_attributes(filterable_attrs).await?;
    }

    Ok(())
}

pub(crate) async fn rebuild_index(meili: &Client, db: &DbConnection) -> Result<()> {
    // TODO: Make sure no other updates reach the search index during this
    // rebuild, as otherwise those might get overwritten and thus lost.
    //
    // We might want to use the "read only mode" that we have to develop anyway
    // in case Opencast is unreachable.

    let event_task = event::rebuild(meili, db).await?;
    let realm_task = realm::rebuild(meili, db).await?;

    info!("Sent all data to Meili, now waiting for it to complete indexing...\n\
        (note: stopping this process does not stop indexing)");

    wait_on_task(event_task, meili).await?;
    wait_on_task(realm_task, meili).await?;

    info!("Meili finished indexing");

    Ok(())
}

async fn wait_on_task(task: Task, meili: &Client) -> Result<()> {
    let task = task.wait_for_completion(
        &meili.client,
        Some(Duration::from_millis(200)),
        Some(Duration::MAX),
    ).await?;

    if let Task::Failed { content } = task {
        error!("Task failed: {:#?}", content);
        bail!(
            "Indexing task for index '{}' failed: {}",
            content.task.index_uid,
            content.error.error_message,
        );
    }

    Ok(())
}


/// Wrapper type for our primary ID that serializes and deserializes as base64
/// encoded string.
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "&str", into = "String")]
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

/// Encodes roles inside an ACL (e.g. for an event) to be stored in the index.
/// The roles are hex encoded to be filterable properly with Meili's
/// case-insensitive filtering. Also, `ROLE_ADMIN` is removed as an space
/// optimization. We handle this case specifically by skipping the ACL check if
/// the user has ROLE_ADMIN.
pub(crate) fn encode_acl(roles: &[String]) -> Vec<String> {
    roles.iter()
        .filter(|&role| role != ROLE_ADMIN)
        .map(hex::encode)
        .collect()
}
