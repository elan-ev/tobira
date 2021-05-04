use std::{
    cmp::min,
    time::Duration,
};

use hyper14::http::status::StatusCode;

use tobira_util::prelude::*;
use tokio_postgres::GenericClient;
use crate::config::Config;
use super::status::SyncStatus;
use self::{
    client::HarvestClient,
    response::HarvestResponse,
};



mod client;
mod response;


// TODO: make (some of) this stuff configurable.

const HARVEST_LIMIT: u64 = 2;

const INITIAL_BACKOFF: Duration = Duration::from_secs(2);
const MAX_BACKOFF: Duration = Duration::from_secs(5 * 60);

const POLL_PERIOD: Duration = Duration::from_secs(30);


/// Continuiously fetches from the harvesting API and writes new data into our
/// database.
pub(crate) async fn run(config: &Config, db: &impl GenericClient) -> Result<()> {
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
