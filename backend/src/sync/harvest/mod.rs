use std::{
    cmp::min,
    time::{Duration, Instant},
};

use deadpool_postgres::Pool;
use serde::de::DeserializeOwned;
use tokio_postgres::types::ToSql;

use crate::{
    auth::{is_special_eth_role, ROLE_ADMIN, ROLE_ANONYMOUS, ETH_ROLE_CREDENTIALS_RE},
    config::Config,
    db::{
        self,
        types::{Credentials, EventCaption, EventSegment, EventState, EventTrack, SeriesState},
    },
    prelude::*,
};
use super::{status::SyncStatus, OcClient};

pub(crate) use self::response::{HarvestItem, HarvestResponse};


mod response;


// TODO: make (some of) this stuff configurable.

const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(5 * 60);


/// Continuously fetches from the harvesting API and writes new data into our
/// database.
pub(crate) async fn run(
    daemon: bool,
    config: &Config,
    client: &OcClient,
    pool: &Pool,
) -> Result<()> {
    // Some duration to wait before the next attempt. Is only set to non-zero in
    // case of an error.
    let mut backoff = INITIAL_BACKOFF;

    let preferred_amount = config.sync.preferred_harvest_size.into();

    if daemon {
        info!("Starting harvesting daemon");
    } else {
        info!("Starting to harvest all data that's available now");
    }

    loop {
        let mut db = pool.get().await?;
        let sync_status = SyncStatus::fetch(&**db).await
            .context("failed to fetch sync status from DB")?;

        // Send request to API and deserialize data.
        let resp = client.send_harvest(sync_status.harvested_until, preferred_amount).await;
        let harvest_data = match resp {
            Ok(v) => v,
            Err(e) => {
                error!("Harvest request failed: {:?}", e);

                // We increase the backoff duration exponentially until we hit the
                // defined maximum.
                info!("Waiting {:.1?} due to error before trying again", backoff);
                drop(db);
                tokio::time::sleep(backoff).await;
                backoff = min(MAX_BACKOFF, backoff.mul_f32(1.5));

                continue;
            },
        };

        // Communication with Opencast succeeded: reset backoff time.
        backoff = INITIAL_BACKOFF;


        if harvest_data.includes_items_until == sync_status.harvested_until {
            bail!("Opencast's harvest response has 'includesItemsUntil' == 'since'. This means \
                harvesting would not make any progress! This problem occurs when the number of \
                events or series with exactly the same modification date is larger than the \
                configured 'preferredHarvestSize'. Increasing 'preferredHarvestSize' might fix \
                this problem. However, be aware of the potential problems with a large harvest \
                size.");
        }


        // Write received data into the database, updating the sync status if
        // everything worked out alright.
        let last_updated = harvest_data.items.iter().rev().find_map(|item| item.updated());
        let mut transaction = db.transaction().await?;
        store_in_db(harvest_data.items, &sync_status, &mut transaction, config).await?;
        SyncStatus::update_harvested_until(harvest_data.includes_items_until, &*transaction).await?;
        transaction.commit().await?;


        // Decide how to proceed (immediately continue, sleep or exit).
        drop(db);
        if harvest_data.has_more {
            let last_updated = last_updated
                .ok_or(anyhow!("Unexpected Opencast response: no items, but `hasMore = true`"))?;

            // This only happens if the Opencast side applies the `TIME_BUFFER_SIZE`
            // (see its docs for more information). This being the case just means that
            // we weren't able to harvest all items that changed in the last
            // `TIME_BUFFER_SIZE` in one go. Immediately requesting the API again would
            // not make sense as we would just run into the same buffer, only making
            // progress as actual time progresses. So we sleep for poll period.
            if last_updated > harvest_data.includes_items_until {
                debug!(
                    "Detected `includesItemsUntil` being capped at `now() - buffer`: waiting {:?} \
                        before starting next harvest.",
                    config.sync.poll_period,
                );
                tokio::time::sleep(config.sync.poll_period).await;
            }
        } else {
            if daemon {
                trace!(
                    "Harvested all available data: waiting {:?} before starting next harvest",
                    config.sync.poll_period,
                );

                tokio::time::sleep(config.sync.poll_period).await;
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
    db: &mut deadpool_postgres::Transaction<'_>,
    config: &Config,
) -> Result<()> {
    let before = Instant::now();
    let mut upserted_events = 0;
    let mut removed_events = 0;
    let mut upserted_series = 0;
    let mut removed_series = 0;
    let mut upserted_playlists = 0;
    let mut removed_playlists = 0;

    for item in items {
        // Make sure we haven't received this update yet. The code below can
        // handle duplicate items alright, but this way we can save on some DB
        // accesses and the logged statistics are more correct.
        if item.updated().is_some_and(|updated| updated < sync_status.harvested_until) {
            debug!("Skipping item which `updated` value is earlier than `harvested_until`");
            continue;
        }

        match item {
            HarvestItem::Event(mut event) => {
                let series_id = match &event.part_of {
                    None => None,
                    Some(part_of) => {
                        db.query_opt("select id from series where opencast_id = $1", &[part_of])
                            .await?
                            .map(|row| row.get::<_, i64>(0))
                    },
                };

                // (**ETH SPECIAL FEATURE**)
                let credentials = config.sync.interpret_eth_passwords
                    .then(|| hashed_eth_credentials(&event.acl.read))
                    .flatten();

                // (**ETH SPECIAL FEATURE**)
                // When an ETH event is password protected, read access doesn't suffice to view a video - everyone
                // without write access needs to authenticate. So we need to shift all read roles down to preview, so
                // users with what was previously read access are only allowed to preview and authenticate.
                // `read_roles` now needs to be an exact copy of `write_roles`, and not a superset.
                // With this, checks that allow actual read access will still succeed for users that also have write
                // access.
                // Additionally, since ETH requires that everyone with the link should be able to authenticate
                // regardless of ACL inclusion, `ROLE_ANONYMOUS` is added to the preview roles.
                if credentials.is_some() {
                    (event.acl.preview, event.acl.read) = (event.acl.read, event.acl.write.clone());
                    event.acl.preview.push(ROLE_ANONYMOUS.into());
                }

                let filter_role = |role: &String| -> bool {
                    role != ROLE_ADMIN && !is_special_eth_role(role, config)
                };

                // We always handle the admin role in a special way, so no need
                // to store it for every single event.
                event.acl.preview.retain(filter_role);
                event.acl.read.retain(filter_role);
                event.acl.write.retain(filter_role);

                for (_, roles) in &mut event.acl.custom_actions.0 {
                    roles.retain(|role| role != ROLE_ADMIN);
                }

                let tracks = event.tracks.into_iter().map(Into::into).collect::<Vec<EventTrack>>();
                let captions = event.captions.into_iter().map(Into::into).collect::<Vec<EventCaption>>();
                let segments = event.segments.into_iter().map(Into::into).collect::<Vec<EventSegment>>();

                // We upsert the event data.
                upsert(db, "all_events", "opencast_id", &[
                    ("opencast_id", &event.id),
                    ("state", &EventState::Ready),
                    ("series", &series_id),
                    ("part_of", &event.part_of),
                    ("is_live", &event.is_live),
                    ("title", &event.title),
                    ("description", &event.description),
                    ("duration", &event.duration),
                    ("created", &event.created),
                    ("start_time", &event.start_time),
                    ("end_time", &event.end_time),
                    ("updated", &event.updated),
                    ("creators", &event.creators),
                    ("thumbnail", &event.thumbnail),
                    ("metadata", &event.metadata),
                    ("preview_roles", &event.acl.preview),
                    ("read_roles", &event.acl.read),
                    ("write_roles", &event.acl.write),
                    ("custom_action_roles", &event.acl.custom_actions),
                    ("tracks", &tracks),
                    ("captions", &captions),
                    ("segments", &segments),
                    ("slide_text", &event.slide_text),
                    ("credentials", &credentials),
                ]).await?;

                trace!("Inserted or updated event {} ({})", event.id, event.title);
                upserted_events += 1;
            }

            HarvestItem::EventDeleted { id: ref opencast_id, .. } => {
                remove_realms(db, config, &item).await?;

                let rows_affected = db
                    .execute("delete from all_events where opencast_id = $1", &[&opencast_id])
                    .await?;
                check_affected_rows_removed(rows_affected, "event", &opencast_id);
                removed_events += 1;
            }

            HarvestItem::Series(mut series) => {
                // (**ETH SPECIAL FEATURE**)
                let series_credentials = config.sync.interpret_eth_passwords
                    .then(|| hashed_eth_credentials(&series.acl.read))
                    .flatten();
                series.acl.read.retain(|role| !is_special_eth_role(role, config));
                series.acl.write.retain(|role| !is_special_eth_role(role, config));

                // We first simply upsert the series.
                let new_id = upsert(db, "all_series", "opencast_id", &[
                    ("opencast_id", &series.id),
                    ("state", &SeriesState::Ready),
                    ("title", &series.title),
                    ("description", &series.description),
                    ("read_roles", &series.acl.read),
                    ("write_roles", &series.acl.write),
                    ("updated", &series.updated),
                    ("created", &series.created),
                    ("metadata", &series.metadata),
                    ("credentials", &series_credentials),
                ]).await?;

                // But now we have to fix the foreign key for any events that
                // previously referenced this series (via the Opencast UUID)
                // but did not have the correct foreign key yet.
                let query = "update events set series = $1 where part_of = $2 and series <> $1";
                let updated_events = db.execute(query, &[&new_id, &series.id]).await?;

                trace!("Inserted or updated series {} ({})", series.id, series.title);
                if updated_events != 0 {
                    debug!(
                        "Fixed foreign series key of {} event(s) after upserting series {} ({})",
                        updated_events,
                        series.id,
                        series.title,
                    );
                }
                upserted_series += 1;
            },

            HarvestItem::SeriesDeleted { id: ref opencast_id, .. } => {
                remove_realms(db, config, &item).await?;

                // We simply remove the series and do not care about any linked
                // events. The foreign key has `on delete set null`. That's
                // what we want: treat it as if the event has no series
                // attached to it. Also see the comment on the migration.
                let rows_affected = db
                    .execute("delete from all_series where opencast_id = $1", &[&opencast_id])
                    .await?;
                check_affected_rows_removed(rows_affected, "series", &opencast_id);
                removed_series += 1;
            }

            HarvestItem::Playlist(playlist) => {
                let entries = playlist.entries.into_iter().filter_map(|e| {
                    // We do not store entries that we don't know, meaning that
                    // a resync is required as soon as Tobira learns about
                    // these new entries. But that's fine as that's likely
                    // required anyway, given that more changes have to be done.
                    let ty = match e.ty.as_str() {
                        "E" => db::types::PlaylistEntryType::Event,
                        _ => return None,
                    };

                    Some(db::types::PlaylistEntry {
                        entry_id: e.id,
                        ty,
                        content_id: e.content_id,
                    })
                }).collect::<Vec<_>>();

                upsert(db, "playlists", "opencast_id", &[
                    ("opencast_id", &playlist.id),
                    ("title", &playlist.title),
                    ("description", &playlist.description),
                    ("creator", &playlist.creator),
                    ("read_roles", &playlist.acl.read),
                    ("write_roles", &playlist.acl.write),
                    ("entries", &entries),
                    ("updated", &playlist.updated),
                ]).await?;

                trace!(playlist.id, playlist.title, "Inserted or updated playlist");
                upserted_playlists += 1;
            }

            HarvestItem::PlaylistDeleted { id: ref opencast_id, .. } => {
                // This doesn't have any effect since realms can't derive their name from playlists yet.
                remove_realms(db, config, &item).await?;

                let rows_affected = db
                    .execute("delete from playlists where opencast_id = $1", &[&opencast_id])
                    .await?;
                check_affected_rows_removed(rows_affected, "playlist", &opencast_id);
                removed_playlists += 1;
            }

            HarvestItem::Unknown(raw) => {
                (|| {
                    let Some(obj) = raw.as_object() else {
                        warn!(?raw, "Unexpected JSON value in harvest response -> ignoring");
                        return;
                    };

                    let Some(kind) = obj.get("kind") else {
                        warn!(?obj, "Item without 'kind' field in harvest response -> ignoring");
                        return;
                    };

                    let Some(kind) = kind.as_str() else {
                        warn!(?kind, "'kind' field has unexpected non-string type in \
                            harvest response -> ignoring");
                        return;
                    };

                    // This tries to deserialize the item again from the `raw`
                    // JSON in order to print a useful error message.
                    fn log_deserialize_error<T: DeserializeOwned>(
                        kind: &str,
                        v: serde_json::Value,
                    ) {
                        let err = serde_json::from_value::<T>(v.clone())
                            .err()
                            .map(|e| e.to_string())
                            // This shouldn't happen, at all. But I rather print
                            // a stupid message than crashing the process.
                            .unwrap_or("failed to fail deserializing... wat".into());

                        error!("Could not deserialize '{kind}' harvest item -> ignoring. \
                            Error: {err}");
                        debug!("Raw value: {}", serde_json::to_string_pretty(&v).unwrap_or("ERR".into()));
                    }

                    match kind {
                        "event" => log_deserialize_error::<response::Event>("event", raw),
                        "series" => log_deserialize_error::<response::Series>("series", raw),
                        "playlist" => log_deserialize_error::<response::Playlist>("playlist", raw),
                        "event-deleted" | "series-deleted" | "playlist-deleted" => {
                            warn!("Could not deserialize item in harvest response for \
                                kind '{kind}'");
                        }
                        _ => {
                            warn!("Unknown item of kind '{kind}' in harvest response. \
                                You might need to update Tobira.");
                        }
                    }
                })();

            }
        }
    }

    if upserted_events == 0 && upserted_series == 0 && upserted_playlists == 0
        && removed_events == 0 && removed_series == 0 && removed_playlists == 0
    {
        trace!("Harvest outcome: nothing changed!");
    } else {
        info!(
            upserted_events, upserted_series, upserted_playlists,
            removed_events, removed_series, removed_playlists,
            "Harvest done in {:.2?}",
            before.elapsed(),
        );
    }

    Ok(())
}

fn check_affected_rows_removed(rows_affected: u64, entity: &str, opencast_id: &str) {
    // The 0 rows affected case is fine: it is deleted anyway, so if we don't
    // have it, then we don't have to do anything.
    match rows_affected {
        0 => debug!("The deleted {} {} from OC did not exist in our database", entity, opencast_id),
        1 => trace!("Removed {} {}", entity, opencast_id),
        _ => unreachable!("DB unique constraints violation when removing a {}", entity),
    }
}

fn hashed_eth_credentials(read_roles: &[String]) -> Option<Credentials> {
    read_roles.iter().find_map(|role| {
        ETH_ROLE_CREDENTIALS_RE.captures(role).map(|captures| Credentials {
            name: format!("sha1:{}", &captures[1]),
            password: format!("sha1:{}", &captures[2]),
        })
    })
}

/// Inserts a new row or updates an existing one if the value in `unique_col`
/// already exists. Returns the value of the `id` column, which is assumed to
/// be `i64`.
async fn upsert(
    db: &deadpool_postgres::Transaction<'_>,
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

    // We prepare the statement beforehand. This is cached by `db` so this
    // actually makes sense to do here.
    let statement = db.prepare_cached(&*query).await?;
    Ok(db.query_one(&statement, &values).await?.get::<_, i64>(0))
}


/// Removes realms that reference a deleted series, event, or playlist,
/// if the configuration allows it.
///
/// If realm deletion is enabled for the given type, the function:
/// 1. Finds all realms whose names are derived from the deleted series/event/playlist.
/// 2. Ensures that those realms have no child realms.
/// 3. If `eager = false`, ensures that the realm has **only one** block (the deleted one).
/// 4. Deletes the qualifying realms from the database.
async fn remove_realms(
    db: &deadpool_postgres::Transaction<'_>,
    config: &Config,
    item: &HarvestItem,
) -> Result<(), tokio_postgres::Error> {
    let Some(props) = item.deleted_props(config) else {
        return Ok(());
    };

    let block_count_condition = if props.eager {
        ""
    } else {
        "and (select count(*) from blocks b2 where b2.realm = r.id) = 1"
    };

    let query = format!(" \
        delete from realms r \
        where r.name_from_block in ( \
            select b.id from blocks b \
            join {table_name} t on b.{block_type} = t.id \
            where t.opencast_id = $1 and b.type = '{block_type}' \
        ) \
        and not exists ( \
            select 1 from realms child where child.parent = r.id \
        ) \
        {block_count_condition}",
        table_name = props.table_name,
        block_type = props.block_type,
    );

    let rows_affected = db.execute(&query, &[&props.id]).await?;
    info!(
        eager = props.eager,
        "Removed {rows_affected} realms referencing {} {}",
        props.block_type,
        props.id,
    );

    Ok(())
}
