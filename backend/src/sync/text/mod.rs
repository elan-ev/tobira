use std::{sync::Arc, time::Duration};

use chrono::{DateTime, Utc};
use futures::{pin_mut, StreamExt};
use hyper::StatusCode;
use secrecy::ExposeSecret as _;
use url::Url;

use crate::{
    config::Config,
    db::{
        self,
        types::{EventCaption, EventTextsQueueRecord, Key, TextAssetType, TimespanText},
        util::{collect_rows_mapped, select},
        DbConnection,
    },
    dbargs,
    prelude::*,
};

mod mpeg7;


/// How many queue entries are loaded and processed in one chunk.
const CHUNK_SIZE: i64 = 100;

/// Number of times an asset is attempted to fetch in case of unexpected errors.
const MAX_RETRIES: i32 = 12;

/// How quickly the DB will be checked for new entries in the queue.
const DB_POLL_PERIOD: Duration = Duration::from_secs(30);

/// How long Tobira will wait initially when backing off (waiting with requests
/// to Opencast).
const INITIAL_BACKOFF: Duration = Duration::from_secs(30);

/// The maximum time waited during a backoff.
const MAX_BACKOFF: Duration = Duration::from_secs(60 * 30);


pub(crate) async fn fetch_update(
    mut db: DbConnection,
    config: &Config,
    daemon: bool,
) -> Result<()> {
    let ctx = Context::new(config)?;

    if daemon {
        info!("Starting text fetching daemon");
    } else {
        info!("Starting to fetch text assets of all queued events");
    }

    let mut backoff = INITIAL_BACKOFF;
    let mut did_work_last = false;
    loop {
        // Check whether there are entries in the queue and whether they are
        // ready yet.
        let sql = "\
            select now() > fetch_after \
            from event_texts_queue \
            order by fetch_after asc \
            limit 1";
        let queue_state = db.query_opt(sql, &[]).await
            .context("failed to check event text queue")?
            .map(|row| row.get::<_, bool>(0));

        if queue_state == Some(true) {
            // There are queue entries that are ready

            // We simply propagate the error upwards as this function only
            // errors on DB errors.
            let outcome = fetch_update_chunk(&ctx, config.sync.concurrent_download_tasks, &mut db)
                .await
                .context("failed to fetch chunk of asset texts")?;
            did_work_last = true;

            match outcome {
                SingleUpdateOutcome::Continue => {
                    // Stuff worked, reset backoff duration.
                    backoff = INITIAL_BACKOFF;
                }
                SingleUpdateOutcome::Backoff => {
                    info!("Some error during text fetching indicates Tobira should backoff \
                        for now. Waiting {backoff:.2?}");
                    tokio::time::sleep(backoff).await;
                    backoff = std::cmp::min(MAX_BACKOFF, backoff * 2);
                }
            }
        } else {
            // Queue is empty or there are queue entries, but none is ready yet.
            //
            // TODO: we could also listen for changes on the table by using
            // PostgreSQL's LISTEN/NOTIFY. And in addition to that, we would
            // sleep until the `fetch_after` timestamp in the DB. But for now,
            // this is easier.
            if queue_state == Some(false) {
                let msg = format!("no queue entries ready to be processed, \
                    waiting {DB_POLL_PERIOD:?}");
                if did_work_last {
                    debug!("{msg}");
                } else {
                    trace!("{msg}");
                }
            } else if daemon {
                trace!("text fetch queue is empty, waiting {DB_POLL_PERIOD:?}");
            } else {
                info!("No events queued for text fetching, exiting");
                return Ok(());
            }

            did_work_last = false;
            tokio::time::sleep(DB_POLL_PERIOD).await;
        }
    }
}


enum SingleUpdateOutcome {
    Continue,
    /// Whether to stop sending requests to Opencast for some time.
    Backoff,
}

async fn fetch_update_chunk(
    ctx: &Context,
    concurrent_tasks: u8,
    db: &mut DbConnection,
) -> Result<SingleUpdateOutcome> {
    let tx = db.build_transaction()
        .isolation_level(tokio_postgres::IsolationLevel::Serializable)
        .start()
        .await?;

    // ----- Load some entries from the queue --------------------------------
    let (selection, mapping) = select!(
        captions: "events.captions",
        slide_text: "events.slide_text",
        event_id,
        opencast_event_id: "events.opencast_id",
        retry_count,
        fetch_after,
    );
    let sql = format!("select {selection}
        from event_texts_queue
        inner join events on events.id = event_id
        where now() > fetch_after
        order by fetch_after asc
        limit $1");
    let entries = collect_rows_mapped(tx.query_raw(&sql, dbargs![&CHUNK_SIZE]), |row| Entry {
        captions: mapping.captions.of(&row),
        slide_text: mapping.slide_text.of(&row),
        opencast_event_id: mapping.opencast_event_id.of(&row),
        queue: EventTextsQueueRecord {
            retry_count: mapping.retry_count.of(&row),
            fetch_after: mapping.fetch_after.of(&row),
            event_id: mapping.event_id.of(&row),
        },
    }).await?;


    // ----- Fetch assets --------------------------------
    //
    // We want to fetch assets in parallel, but with a limited number of
    // parallel fetch tasks. To do that, we first create a stream of futures.
    let future_iter = entries.into_iter().map(|entry| {
        let ctx = ctx.clone();
        async move {
            let uris = entry.captions.into_iter()
                .map(|caption| (caption.uri, TextAssetType::Caption))
                .chain(entry.slide_text.map(|s| (s, TextAssetType::SlideText)));

            let mut texts = Vec::new();
            for (uri, ty) in uris {
                match process_asset(ty, &uri, &entry.opencast_event_id, &ctx).await {
                    Outcome::Ignore => {},
                    Outcome::Retry => {
                        return (QueueAction::BumpRetryCount, entry.queue, texts);
                    },
                    Outcome::Backoff => {
                        return (QueueAction::Backoff, entry.queue, texts);
                    },
                    Outcome::Success(t) => {
                        texts.push(EventTextEntry {
                            uri,
                            event_id: entry.queue.event_id,
                            texts: t,
                            ty,
                            fetch_time: Utc::now(),
                        });
                    },
                }
            }

            (QueueAction::Remove, entry.queue, texts)
        }
    });
    let mut stream = futures::stream::iter(future_iter).buffer_unordered(concurrent_tasks.into());

    // Iterate over the `buffer_unordered` stream and read the results.
    let mut texts_to_be_inserted = Vec::new();
    let mut queue_entries_to_be_deleted = Vec::new();
    let mut queue_entries_to_be_bumped = Vec::new();
    let mut out = SingleUpdateOutcome::Continue;
    while let Some((queue_action, queue_entry, event_texts)) = stream.next().await {
        trace!(
            event = ?queue_entry.event_id,
            ?queue_action,
            "fetched {} text assets",
            event_texts.len(),
        );

        texts_to_be_inserted.extend(event_texts);
        match queue_action {
            QueueAction::Remove => queue_entries_to_be_deleted.push(queue_entry),
            QueueAction::BumpRetryCount => {
                if queue_entry.retry_count >= MAX_RETRIES {
                    warn!(
                        event = ?queue_entry.event_id,
                        "Giving up fetching texts for event after already trying {} times",
                        queue_entry.retry_count,
                    );
                    queue_entries_to_be_deleted.push(queue_entry);
                } else {
                    queue_entries_to_be_bumped.push(queue_entry);
                }
            }
            QueueAction::Backoff => {
                out = SingleUpdateOutcome::Backoff;
                break;
            }
        }
    }


    // ----- Write all changes to DB ------------------------------------------

    // Bump retry counts of some queue entries. We use a simple exponential
    // backoff.
    let sql = "update event_texts_queue \
        set retry_count = retry_count + 1,
            fetch_after = now() + interval '1 minute' * pow(2, retry_count)
        where event_texts_queue.* = any($1::event_texts_queue[])";
    let bumped_queue_entries = tx.execute(sql,&[&queue_entries_to_be_bumped]).await
        .context("failed to update queue entries")?;

    // Write fetched texts to DB and clear old ones for these events.
    let event_ids = texts_to_be_inserted.iter().map(|t| t.event_id).collect::<Vec<_>>();
    tx.execute("delete from event_texts where event_id = any($1)", &[&event_ids]).await
        .context("failed to delete from event_texts")?;
    let columns = ["uri", "event_id", "ty", "texts", "fetch_time"];
    let writer = db::util::bulk_insert("event_texts", &columns, &tx).await?;
    pin_mut!(writer);
    for t in &texts_to_be_inserted {
        writer.as_mut()
            .write_raw(dbargs![&t.uri, &t.event_id, &t.ty, &t.texts, &t.fetch_time])
            .await?;
    }
    writer.finish().await?;

    // Remove entries from queue
    let sql = "delete from event_texts_queue \
        where event_texts_queue.* = any($1::event_texts_queue[])";
    let removed_queue_entries = tx.execute(sql, &[&queue_entries_to_be_deleted]).await
        .context("failed to remove entires from queue")?;

    tx.commit().await.context("failed to commit DB transaction")?;
    debug!(
        bumped_queue_entries,
        removed_queue_entries,
        upserted_event_texts = texts_to_be_inserted.len(),
        "Persisted event text fetching to DB",
    );

    Ok(out)
}

#[derive(Debug)]
struct Entry {
    captions: Vec<EventCaption>,
    slide_text: Option<String>,
    opencast_event_id: String,
    queue: EventTextsQueueRecord,
}

#[derive(Debug)]
struct EventTextEntry {
    uri: String,
    event_id: Key,
    texts: Vec<TimespanText>,
    ty: TextAssetType,
    fetch_time: DateTime<Utc>,
}

#[derive(Clone)]
struct Context {
    http_client: reqwest::Client,
    is_uri_allowed: Arc<dyn Fn(&Url) -> bool>,
}

impl Context {
    fn new(config: &Config) -> Result<Self> {
        let is_uri_allowed = {
            let oc = &config.opencast;
            let allowed_hosts = [&oc.host, &oc.sync_node, &oc.upload_node]
                .into_iter()
                .cloned()
                .flatten()
                .chain(config.opencast.other_hosts.iter().cloned())
                .collect::<Arc<[_]>>();
            Arc::new(move |url: &Url| {
                allowed_hosts.iter().any(|allowed| {
                    url.scheme() == &allowed.scheme
                        && url.authority() == &allowed.authority
                })
            })
        };

        let http_client = {
            use reqwest::header;

            let mut headers = header::HeaderMap::new();
            let mut header_value = header::HeaderValue::try_from(
                config.sync.basic_auth_header().expose_secret()
            ).unwrap();
            header_value.set_sensitive(true);
            headers.insert(header::AUTHORIZATION, header_value);

            let is_uri_allowed = is_uri_allowed.clone();
            reqwest::Client::builder()
                .user_agent("Tobira")
                .default_headers(headers)
                .redirect(reqwest::redirect::Policy::custom(move |attempt| {
                    if attempt.previous().len() > 10 {
                        attempt.error("too many redirects")
                    } else if is_uri_allowed(attempt.url()) {
                        attempt.follow()
                    } else {
                        attempt.error("redirect to non-trusted host")
                    }
                }))
                .build()
                .context("failed to build HTTP client")?
        };

        Ok(Self { http_client, is_uri_allowed })
    }
}

#[derive(Debug)]
enum QueueAction {
    /// Remove entry from queue -> we are done with it.
    Remove,

    /// Keep entry in queue, but bump the retry count and adjust the
    /// `fetch_after` timestamp.
    BumpRetryCount,

    /// Tobira should temporarily pause fetching. The queue entry remains in the
    /// queue as before.
    Backoff,
}

/// Possible outcomes when operating on a single text asset.
enum Outcome<T> {
    /// Operation for this asset failed, but we will ignore it because retrying
    /// does not seem worthwhile. Other fetched assets of the same event are
    /// written to the DB, though. To retry, the admin has to manually queue
    /// the events again.
    Ignore,

    /// Operation for this asset failed, likely in a temporary fashion. The
    /// event should remain queued so that it can be tried again later.
    Retry,

    /// Operation for this asset failed in a way that indicates Opencast is
    /// currently not operational. The whole fetching process should pause for
    /// some time. The operation will then be tried again.
    Backoff,

    /// Operation successful.
    Success(T),
}



/// Downloads & parses a single text asset.
#[tracing::instrument(level = "trace", skip(ctx))]
async fn process_asset(
    ty: TextAssetType,
    uri: &str,
    oc_event_id: &str,
    ctx: &Context,
) -> Outcome<Vec<TimespanText>> {
    let text = match download_asset(&uri, &oc_event_id, &ctx).await {
        Outcome::Ignore => return Outcome::Ignore,
        Outcome::Retry => return Outcome::Retry,
        Outcome::Backoff => return Outcome::Backoff,
        Outcome::Success(text) => text,
    };

    let texts = if uri.ends_with(".vtt") || ty == TextAssetType::Caption {
        parse_vtt(text)
    } else if uri.ends_with(".xml") || ty == TextAssetType::SlideText {
        mpeg7::parse(&text)
    } else {
        warn!(oc_event_id, uri, "unknown file type of text -> ignoring");
        return Outcome::Ignore;
    };

    match texts {
        Ok(t) => Outcome::Success(t),
        Err(e) => {
            warn!(oc_event_id, uri, "failed to parse file ({e}) -> ignoring");
            Outcome::Ignore
        }
    }
}


async fn download_asset(
    uri: &str,
    event_oc_id: &str,
    ctx: &Context,
) -> Outcome<String> {
    trace!(uri, event = event_oc_id, "downloading text asset...");

    macro_rules! warn {
        ($($t:tt)*) => {
            tracing::warn!(uri, event = event_oc_id, $($t)*);
        };
    }

    let url = match Url::parse(uri) {
        Ok(url) => url,
        Err(e) => {
            warn!("Asset URL is not a valid URL ({e}) -> ignoring");
            return Outcome::Ignore;
        }
    };

    if !(ctx.is_uri_allowed)(&url) {
        warn!("Host of asset URI does not match any configured Opencast node -> ignoring");
        return Outcome::Ignore;
    };

    let resp = match ctx.http_client.get(uri).send().await {
        Ok(r) => r,
        Err(e) => {
            warn!("Requesting asset failed due to network error ({e}) -> backing off");
            return Outcome::Backoff;
        }
    };


    match resp.status() {
        // Expected: all good
        StatusCode::OK => {}

        // 500 -> no idea. Will retry a few times later.
        StatusCode::INTERNAL_SERVER_ERROR => {
            warn!("Requesting asset returned 500 -> trying again later");
            return Outcome::Retry;
        }

        // Indications that Opencast is down or is requesting fewer requests.
        StatusCode::BAD_GATEWAY
        | StatusCode::SERVICE_UNAVAILABLE
        | StatusCode::GATEWAY_TIMEOUT
        | StatusCode::TOO_MANY_REQUESTS => {
            warn!("Requesting asset returned status {} -> backing off", resp.status());
            return Outcome::Backoff;
        }

        // TODO: we might want to use caching header in the future
        //StatusCode::NOT_MODIFIED

        // All other codes shouldn't happen. We also treat them as temporary
        // - 1xx
        // - 2xx >= 201
        // - 300
        // - 307, 308
        // - 400, 402, 404, 405 - 428, 431, 451
        // - 401 & 403 -> we use admin user, this shouldn't happen
        // - 501, 505, 506, 507, 508, 510, 511
        _ => {
            warn!("Requesting asset returned unexpected status {} -> ignoring", resp.status());
            return Outcome::Ignore;
        }
    }

    match resp.text().await {
        Ok(text) => Outcome::Success(text),
        Err(e) => {
            warn!("Failed to download asset due to network error ({e}) -> backing off");
            Outcome::Backoff
        }
    }
}

fn parse_vtt(mut src: String) -> Result<Vec<TimespanText>> {
    fn to_millis(vtt: &subtp::vtt::VttTimestamp) -> i64 {
        vtt.milliseconds as i64
            + vtt.seconds as i64 * 1000
            + vtt.minutes as i64 * 1000 * 60
            + vtt.hours as i64 * 1000 * 60 * 60
    }

    // The VTT parser requires a trailing newline, but some files do not have
    // that. So we simply push one.
    src.push('\n');

    let vtt = subtp::vtt::WebVtt::parse(&src)?;
    let out = vtt.blocks.iter()
        .filter_map(|b| match b {
            subtp::vtt::VttBlock::Que(cue) => Some(cue),
            _ => None,
        })
        .map(|cue| {
            TimespanText {
                span_start: to_millis(&cue.timings.start),
                span_end: to_millis(&cue.timings.end),
                t: cue.payload.join("\n"),
            }
        })
        .collect();


    Ok(out)
}
