use std::{
    cmp::min,
    time::Duration,
};

use hyper::http::status::StatusCode;

use tobira_util::prelude::*;
use tokio_postgres::GenericClient;
use crate::config::Config;
use super::status::SyncStatus;
use self::{client::HarvestClient, response::{HarvestItem, HarvestResponse}};



mod client;
mod response;


// TODO: make (some of) this stuff configurable.

const PREFERRED_AMOUNT: u64 = 2;

const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(5 * 60);

const POLL_PERIOD: Duration = Duration::from_secs(30);


/// Continuiously fetches from the harvesting API and writes new data into our
/// database.
pub(crate) async fn run(config: &Config, db: &impl GenericClient) -> Result<()> {
    // Some duration to wait before the next attempt. Is only set to non-zero in
    // case of an error.
    let mut backoff = INITIAL_BACKOFF;

    /// Helper macro to call in case of not being able to get a proper response
    /// from Opencast. Forwards all arguments to `error!`, increases `backoff`
    /// and sleeps for the backoff period.
    macro_rules! request_failed {
        ($($t:tt)*) => {{
            error!($($t)*);

            // We increase the backoff duration exponentially until we hit the
            // defined maximum.
            info!("Waiting {:.1?} due to error before trying again", backoff);
            tokio::time::sleep(backoff).await;
            backoff = min(MAX_BACKOFF, backoff.mul_f32(1.5));

            continue;
        }};
    }

    let client = HarvestClient::new(config);

    loop {
        let sync_status = SyncStatus::fetch(db).await
            .context("failed to fetch sync status from DB")?;


        // Send request to API and deserialize data.
        let req = client.send(sync_status.harvested_until, PREFERRED_AMOUNT);
        let (response, body) = match req.await {
            Ok(v) => v,
            Err(e) => request_failed!("Harvest request failed: {:?}", e),
        };

        if response.status != StatusCode::OK {
            trace!("HTTP response: {:#?}", response);
            request_failed!("Harvest API returned unexpected HTTP code {}", response.status);
        }

        let harvest_data = match serde_json::from_slice::<HarvestResponse>(&body) {
            Ok(v) => v,
            Err(e) => {
                trace!("HTTP response: {:#?}", response);
                request_failed!("Failed to deserialize response from harvesting API: {}", e);
            }
        };

        // Communication with Opencast succeeded: reset backoff time.
        backoff = INITIAL_BACKOFF;


        // Write received data into the database, updating the sync status if
        // everything worked out alright.
        store_in_db(&harvest_data.items, &sync_status, db).await?;
        SyncStatus::update_harvested_until(harvest_data.includes_items_until, db).await?;
        if !harvest_data.has_more {
            debug!(
                "Harvested all available data: waiting {:?} before starting next harvest",
                POLL_PERIOD,
            );

            tokio::time::sleep(POLL_PERIOD).await;
        }
    }
}

async fn store_in_db(
    items: &[HarvestItem],
    sync_status: &SyncStatus,
    db: &impl GenericClient,
) -> Result<()> {
    let mut upserted_events = 0;
    let mut removed_events = 0;
    let mut upserted_series = 0;
    let mut removed_series = 0;

    for item in items {
        // Make sure we haven't received this update yet. The code below can
        // handle duplicate items alright, but this way we can save on some DB
        // accesses and the logged statistics are more correct.
        if item.updated() < sync_status.harvested_until {
            debug!("Skipping item which `updated` value is earlier than `harvested_until`");
            continue;
        }

        match item {
            HarvestItem::Event { id, title, description, part_of, .. } => {
                let series = match part_of {
                    None => None,
                    Some(part_of) => {
                        db.query_opt("select id from series where opencast_id = $1", &[part_of])
                            .await?
                            .map(|row| row.get::<_, i64>(0))
                    },
                };

                // We upsert the event data.
                let query = "\
                    insert into events \
                    (opencast_id, title, description, series, part_of, duration, thumbnail, video) \
                    values ($1, $2, $3, $4, $5, 1337, 'TODO', 'TODO') \
                    on conflict (opencast_id) \
                    do update set \
                        title = excluded.title, \
                        description = excluded.description, \
                        series = excluded.series, \
                        part_of = excluded.part_of, \
                        duration = excluded.duration, \
                        thumbnail = excluded.thumbnail, \
                        video = excluded.video; \
                    ";
                db.execute(query, &[id, title, description, &series, part_of]).await?;

                debug!("Inserted or update event {} ({})", id, title);
                upserted_events += 1;

                // TODO: fix duration, thumbnail and video, obviously
                // TODO: we might actually want to store the `updated` field
                //       and make sure we don't overwrite with older data.
            }

            HarvestItem::EventDeleted { id: opencast_id, .. } => {
                let rows_affected = db
                    .execute("delete from events where opencast_id = $1", &[opencast_id])
                    .await?;
                check_affected_rows_removed(rows_affected, "event", &opencast_id);
                removed_events += 1;
            }

            HarvestItem::Series { id: opencast_id, title, description, .. } => {
                // We first simply upsert the series.
                let query = "\
                    insert into series \
                    (opencast_id, title, description) \
                    values ($1, $2, $3) \
                    on conflict (opencast_id) \
                    do update set \
                        title = excluded.title, \
                        description = excluded.description \
                    returning id
                ";
                let new_id = db.query_one(query, &[opencast_id, title, description])
                    .await?
                    .get::<_, i64>(0);

                // But now we have to fix the foreign key for any events that
                // previously referenced this series (via the Opencast UUID)
                // but did not have the correct foreign key yet.
                let query = "update events set series = $1 where part_of = $2 and series <> $1";
                let updated_events = db.execute(query, &[&new_id, opencast_id]).await?;

                debug!("Inserted or updated series {} ({})", opencast_id, title);
                if updated_events != 0 {
                    debug!(
                        "Fixed foreign series key of {} event(s) after upserting series {} ({})",
                        updated_events,
                        opencast_id,
                        title,
                    );
                }
                upserted_series += 1;
            },

            HarvestItem::SeriesDeleted { id: opencast_id, .. } => {
                // We simply remove the series and do not care about any linked
                // events. The foreign key has `on delete set null`. That's
                // what we want: treat it as if the event has no series
                // attached to it. Also see the comment on the migration.
                let rows_affected = db
                    .execute("delete from series where opencast_id = $1", &[opencast_id])
                    .await?;
                check_affected_rows_removed(rows_affected, "series", &opencast_id);
                removed_series += 1;
            }
        }
    }

    if upserted_events == 0 && upserted_series == 0 && removed_events == 0 && removed_series == 0 {
        info!("Harvest outcome: nothing changed!");
    } else {
        info!(
            "Harvest outcome: upserted {} events, upserted {} series, \
                removed {} events, removed {} series",
            upserted_events,
            upserted_series,
            removed_events,
            removed_series,
        );
    }

    Ok(())
}

fn check_affected_rows_removed(rows_affected: u64, entity: &str, opencast_id: &str) {
    // The 0 rows affected case is fine: it is deleted anyway, so if we don't
    // have it, then we don't have to do anything.
    match rows_affected {
        0 => debug!("The deleted {} {} from OC did not exist in our database", entity, opencast_id),
        1 => debug!("Removed {} {}", entity, opencast_id),
        _ => unreachable!("DB unique constraints violation when removing a {}", entity),
    }
}
