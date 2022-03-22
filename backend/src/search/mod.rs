use std::{time::Duration, fmt};

use meilisearch_sdk::{
    client::Client as MeiliClient,
    indexes::Index,
    tasks::Task,
    errors::ErrorCode,
};
use secrecy::{Secret, ExposeSecret};
use serde::{Deserialize, Serialize};

use crate::{prelude::*, util::HttpHost, db::{DbConnection, types::Key}};

pub(crate) mod cmd;
mod event;

pub(crate) use self::event::Event;


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
}

pub(crate) struct Client {
    config: MeiliConfig,
    client: MeiliClient,
    pub(crate) event_index: Index,
}

impl Client {
    async fn new(config: MeiliConfig) -> Result<Self> {
        // TODO: allow HTTPS connections
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

        let event_index = create_index(&client, &config.event_index_name()).await?;
        event::prepare_index(&event_index).await?;
        debug!("All required Meili indexes exist (they might be empty though)");

        Ok(Self { client, config, event_index })
    }
}

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

pub(crate) async fn rebuild_index(meili: &Client, db: &DbConnection) -> Result<()> {
    // TODO: Make sure no other updates reach the search index during this
    // rebuild, as otherwise those might get overwritten and thus lost.
    //
    // We might want to use the "read only mode" that we have to develop anyway
    // in case Opencast is unreachable.

    let event_task = event::rebuild(meili, db).await?;

    info!("Sent all data to Meili, now waiting for it to complete indexing...\n\
        (note: stopping this process does not stop indexing)");

    let event_task = event_task.wait_for_completion(
        &meili.client,
        Some(Duration::from_millis(200)),
        Some(Duration::MAX),
    ).await?;
    error_on_failed_task(&event_task)?;

    info!("Meili finished indexing");

    Ok(())
}

fn error_on_failed_task(task: &Task) -> Result<()> {
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

pub(crate) fn hex_encode_roles(roles: &[String]) -> Vec<String> {
    roles.iter().map(hex::encode).collect()
}
