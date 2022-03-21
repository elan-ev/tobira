use meilisearch_sdk::{client::Client as MeiliClient, indexes::Index, tasks::Task, errors::ErrorCode, document::Document};
use secrecy::{Secret, ExposeSecret};
use serde::{Serialize, Deserialize};

use crate::{prelude::*, util::HttpHost};

pub(crate) mod cmd;


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

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Event {
    pub(crate) id: i64,
    pub(crate) opencast_id: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) creators: Vec<String>,
    pub(crate) thumbnail: Option<String>,
}

impl Document for Event {
   type UIDType = i64;
   fn get_uid(&self) -> &Self::UIDType {
       &self.id
   }
}
