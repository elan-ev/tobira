use hyper::StatusCode;
use hyper14::http::uri::{Authority, Scheme, Uri};
use hyper14::{Request, client::Client};
use hyper_tls::HttpsConnector;
use secrecy::ExposeSecret;
use serde::Deserialize;

use tobira_util::prelude::*;
use crate::{config::Config, db};


pub(crate) async fn run(config: &Config) -> Result<()> {
    info!("Starting Tobira <-> Opencast synchronization server ...");
    trace!("Configuration: {:#?}", config);

    // Open DB connection, check consistency and migrate if necessary.
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;

    harvest(config).await?;

    Ok(())
}

/// Continuiously contacts the harvesting API and writes new data into our
/// database.
async fn harvest(config: &Config) -> Result<()> {
    // Prepare HTTP client
    let client = Client::builder().build::<_, hyper14::Body>(HttpsConnector::new());

    // Prepare URL
    let scheme = if config.opencast.use_insecure_connection {
        Scheme::HTTP
    } else {
        Scheme::HTTPS
    };
    let authority = config.opencast.host.parse::<Authority>().expect("bug: invalid config");
    let path_query = |since: Timestamp, limit| {
        format!("/tobira/harvest?since={}&limit={}", since.0, limit)
    };

    // Prepare authentication
    let auth_header = {
        let credentials = format!(
            "{}:{}",
            config.opencast.sync_user,
            config.opencast.sync_password.expose_secret(),
        );
        format!("Basic {}", base64::encode(credentials))
    };

    loop {
        let uri = Uri::builder()
            .scheme(scheme)
            .authority(authority)
            .path_and_query(&*path_query(Timestamp(0), 5))
            .build()
            .expect("bug: failed build URI");

        let req = Request::builder()
            .uri(&uri)
            .header("Authorization", auth_header)
            .body(hyper14::Body::empty())
            .expect("bug: failed to build request");

        debug!("Sending harvest request: GET {}", uri);
        let res = client.request(req).await?;

        trace!("HTTP response: {:#?}", res);
        if res.status() != StatusCode::OK {
            todo!("non ok http status");
        }

        let body = hyper14::body::to_bytes(res).await?;
        match serde_json::from_slice::<HarvestResponse>(&body) {
            Err(e) => {
                todo!("Failed to deserialize response: {}", e);
            }
            Ok(response) => {
                println!("{:#?}", response);
            }
        }

        break;
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HarvestResponse {
    includes_items_until: Timestamp,
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
        updated: Timestamp,
    },
    #[serde(rename_all = "camelCase")]
    EventDeleted {
        id: String,
        updated: Timestamp,
    },
}

#[derive(Debug, Deserialize)]
struct Timestamp(u64);
