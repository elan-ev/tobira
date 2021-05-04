use std::{
    cmp::min,
    time::Duration,
};

use chrono::{DateTime, NaiveDateTime, Utc};
use hyper14::{
    Request, Body,
    body::Bytes,
    client::{Client, HttpConnector},
    http::{
        response,
        status::StatusCode,
        uri::{Authority, Scheme, Uri},
    }
};
use hyper_tls::HttpsConnector;
use secrecy::{ExposeSecret, Secret};
use serde::Deserialize;

use tobira_util::prelude::*;
use tokio_postgres::GenericClient;
use crate::{config::Config, db};


// TODO: make (some of) this stuff configurable.

const HARVEST_LIMIT: u64 = 2;

const INITIAL_BACKOFF: Duration = Duration::from_secs(2);
const MAX_BACKOFF: Duration = Duration::from_secs(5 * 60);

const POLL_PERIOD: Duration = Duration::from_secs(30);


pub(crate) async fn run(config: &Config) -> Result<()> {
    info!("Starting Tobira <-> Opencast synchronization server ...");
    trace!("Configuration: {:#?}", config);

    // Open DB connection, check consistency and migrate if necessary.
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;

    let db_connection = db.get().await?;
    harvest(config, &**db_connection).await?;

    Ok(())
}

/// Continuiously contacts the harvesting API and writes new data into our
/// database.
async fn harvest(config: &Config, db: &impl GenericClient) -> Result<()> {
    // Some duration to wait before the next attempt. Is only set to non-zero in
    // case of an error.
    // TODO: replace by `ZERO` constant in two days.
    let mut backoff = Duration::from_secs(0);

    /// Helper macro to call in case of not being able to get a proper response
    /// from Opencast. Forwards all arguments to `error!`, increases `backoff`
    /// and sleeps for the backoff period.
    macro_rules! request_failed {
        ($($t:tt)*) => {{
            error!($($t)*);

            // We increase the backoff duration exponentially until we hit the
            // defined maximum.
            // TODO: replace by `ZERO` constant in two days.
            backoff = if backoff == Duration::from_secs(0) {
                INITIAL_BACKOFF
            } else {
                min(MAX_BACKOFF, 2 * backoff)
            };
            info!("Waiting {:.0?} due to error before trying again", backoff);
            tokio::time::sleep(backoff).await;

            continue;
        }};
    }

    let client = HarvestClient::new(config);

    loop {
        let sync_status = SyncStatus::fetch(db).await
            .context("failed to fetch sync status from DB")?;


        // Send request to API and deserialize data.
        let (response, body) = match client.send(sync_status.harvested_until, HARVEST_LIMIT).await {
            Ok(v) => v,
            Err(e) => request_failed!("Harvest request failed: {:?}", e),
        };

        trace!("HTTP response: {:#?}", response);
        if response.status != StatusCode::OK {
            request_failed!("Harvest API returned unexepcted HTTP code {}", response.status);
        }

        let harvest_data = match serde_json::from_slice::<HarvestResponse>(&body) {
            Ok(v) => v,
            Err(e) => request_failed!("Failed to deserialize response from harvesting API: {}", e),
        };


        // Write received data into the database, updating the sync status if
        // everything worked out alright.
        store_in_db(&harvest_data, db).await?;
        SyncStatus::update_harvested_until(harvest_data.includes_items_until, db).await?;
        if !harvest_data.has_more {
            debug!(
                "Harvested all available data. Waiting {:?} before starting next harvest",
                POLL_PERIOD,
            );

            tokio::time::sleep(POLL_PERIOD).await;
        }
    }
}

async fn store_in_db(data: &HarvestResponse, _db: &impl GenericClient) -> Result<()> {
    // TODO
    println!("{:#?}", data);

    Ok(())
}

/// Used to send request to the harvesting API.
struct HarvestClient {
    http_client: Client<HttpsConnector<HttpConnector>, Body>,
    scheme: Scheme,
    authority: Authority,
    auth_header: Secret<String>,
}

impl HarvestClient {
    const API_PATH: &'static str = "/tobira/harvest";

    fn new(config: &Config) -> Self {
        // Prepare HTTP client
        let http_client = Client::builder().build(HttpsConnector::new());

        // Prepare URL
        let scheme = if config.opencast.use_insecure_connection {
            Scheme::HTTP
        } else {
            Scheme::HTTPS
        };
        let authority = config.opencast.host.parse::<Authority>().expect("bug: invalid config");

        // Prepare authentication
        let credentials = format!(
            "{}:{}",
            config.opencast.sync_user,
            config.opencast.sync_password.expose_secret(),
        );
        let auth_header = format!("Basic {}", base64::encode(credentials));

        Self {
            http_client,
            scheme,
            authority,
            auth_header: Secret::new(auth_header),
        }
    }

    /// Sends a request to the harvesting API. Returns the response "meta data"
    /// and the downloaded response body.
    async fn send(
        &self,
        since: DateTime<Utc>,
        limit: u64,
    ) -> Result<(response::Parts, Bytes)> {
        let pq = format!(
            "{}?since={}&limit={}",
            Self::API_PATH,
            since.timestamp_millis(),
            limit,
        );

        let uri = Uri::builder()
            .scheme(self.scheme.clone())
            .authority(self.authority.clone())
            .path_and_query(&*pq)
            .build()
            .expect("bug: failed build URI");

        let req = Request::builder()
            .uri(&uri)
            .header("Authorization", self.auth_header.expose_secret())
            .body(Body::empty())
            .expect("bug: failed to build request");

        debug!("Sending harvest request (since = {:?}): GET {}", since, uri);
        let response = self.http_client.request(req).await
            .with_context(|| format!("failed to GET {}", uri))?;

        let (parts, body) = response.into_parts();
        let body = hyper14::body::to_bytes(body).await
            .with_context(|| format!("failed to download body from {}", uri))?;
        Ok((parts, body))
    }
}

struct SyncStatus {
    harvested_until: DateTime<Utc>,
}

impl SyncStatus {
    async fn fetch(db: &impl GenericClient) -> Result<Self> {
        let row = db.query_one("select harvested_until from sync_status", &[]).await?;

        Ok(Self {
            harvested_until: DateTime::from_utc(row.get::<_, NaiveDateTime>(0), Utc),
        })
    }

    async fn update_harvested_until(
        new_value: DateTime<Utc>,
        db: &impl GenericClient,
    ) -> Result<()> {
        db.execute(
            "update sync_status set harvested_until = $1",
            &[&new_value.naive_utc()],
        ).await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HarvestResponse {
    #[serde(with = "chrono::serde::ts_milliseconds")]
    includes_items_until: DateTime<Utc>,
    has_more: bool,
    items: Vec<HarvestItem>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
#[serde(rename_all = "kebab-case")]
enum HarvestItem {
    #[serde(rename_all = "camelCase")]
    Event {
        id: String,
        title: String,
        description: Option<String>,
        part_of: Option<String>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },
    #[serde(rename_all = "camelCase")]
    EventDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },
}
