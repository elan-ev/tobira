use std::{
    cmp::min,
    time::Duration,
};

use hyper::http::status::StatusCode;
use tokio_postgres::{GenericClient, types::ToSql};

use crate::{db::types::EventTrack, prelude::*};
use super::{SyncConfig, status::SyncStatus};
use self::{client::HarvestClient, response::{HarvestItem, HarvestResponse}};



mod client;
mod response;


// TODO: make (some of) this stuff configurable.

const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(5 * 60);

const POLL_PERIOD: Duration = Duration::from_secs(30);


/// Continuiously fetches from the harvesting API and writes new data into our
/// database.
pub(crate) async fn run(daemon: bool, config: &SyncConfig, db: &impl GenericClient) -> Result<()> {
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
        let req = client.send(
            sync_status.harvested_until,
            config.preferred_harvest_size.into(),
        );
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
        store_in_db(harvest_data.items, &sync_status, db).await?;
        SyncStatus::update_harvested_until(harvest_data.includes_items_until, db).await?;
        if !harvest_data.has_more {
            if daemon {
                debug!(
                    "Harvested all available data: waiting {:?} before starting next harvest",
                    POLL_PERIOD,
                );

                tokio::time::sleep(POLL_PERIOD).await;
            } else {
                info!("Harvested all available data: exiting now.");
                return Ok(());
            }
        }
    }
}

async fn store_in_db(
    items: Vec<HarvestItem>,
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
            HarvestItem::Event {
                id: opencast_id,
                title,
                description,
                part_of,
                tracks,
                created,
                creator,
                duration,
                thumbnail,
                acl,
                updated,
            } => {
                let series = match &part_of {
                    None => None,
                    Some(part_of) => {
                        db.query_opt("select id from series where opencast_id = $1", &[part_of])
                            .await?
                            .map(|row| row.get::<_, i64>(0))
                    },
                };

                // We upsert the event data.
                upsert(db, "events", "opencast_id", &[
                    ("opencast_id", &opencast_id),
                    ("series", &series),
                    ("part_of", &part_of),
                    ("title", &title),
                    ("description", &description),
                    ("duration", &duration),
                    ("created", &created),
                    ("updated", &updated),
                    ("creator", &creator),
                    ("thumbnail", &thumbnail),
                    ("read_roles", &acl.read),
                    ("write_roles", &acl.write),
                    ("tracks", &tracks.into_iter().map(Into::into).collect::<Vec<EventTrack>>()),
                ]).await?;

                debug!("Inserted or update event {} ({})", opencast_id, title);
                upserted_events += 1;
            }

            HarvestItem::EventDeleted { id: opencast_id, .. } => {
                let rows_affected = db
                    .execute("delete from events where opencast_id = $1", &[&opencast_id])
                    .await?;
                check_affected_rows_removed(rows_affected, "event", &opencast_id);
                removed_events += 1;
            }

            HarvestItem::Series { id: opencast_id, title, description, updated } => {
                // We first simply upsert the series.
                let new_id = upsert(db, "series", "opencast_id", &[
                    ("opencast_id", &opencast_id),
                    ("title", &title),
                    ("description", &description),
                    ("updated", &updated),
                ]).await?;

                // But now we have to fix the foreign key for any events that
                // previously referenced this series (via the Opencast UUID)
                // but did not have the correct foreign key yet.
                let query = "update events set series = $1 where part_of = $2 and series <> $1";
                let updated_events = db.execute(query, &[&new_id, &opencast_id]).await?;

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
                    .execute("delete from series where opencast_id = $1", &[&opencast_id])
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

/// Inserts a new row or updates an existing one if the value in `unique_col`
/// already exists. Returns the value of the `id` column, which is assumed to
/// be `i64`.
async fn upsert(
    db: &impl GenericClient,
    table_name: &str,
    unique_col: &str,
    cols: &[(&str, &(dyn ToSql + Sync))],
) -> Result<i64> {
    let mut query_col_names = String::new();
    let mut query_col_values = String::new();
    let mut query_update = String::new();
    let mut values = Vec::new();
    for (i, (name, value)) in cols.iter().copied().enumerate() {
        if !query_col_names.is_empty() {
            query_col_names += ", ";
        }
        query_col_names += name;

        if !query_col_values.is_empty() {
            query_col_values += ", ";
        }
        query_col_values += &format!("${}", i + 1);

        if !query_update.is_empty() {
            query_update += ", ";
        }
        if name != unique_col {
            query_update += &format!("{0} = excluded.{0}", name);
        }

        values.push(value);
    }

    let query = format!(
        "insert into {} ({}) values ({}) on conflict ({}) do update set {} returning id",
        table_name,
        query_col_names,
        query_col_values,
        unique_col,
        query_update,
    );

    Ok(db.query_one(&*query, &values).await?.get::<_, i64>(0))
}
