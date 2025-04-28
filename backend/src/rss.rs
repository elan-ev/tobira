use std::{sync::Arc, future, collections::HashMap};
use chrono::{DateTime, Utc};
use deadpool_postgres::GenericClient;
use anyhow::{Error, Result};
use futures::TryStreamExt;
use ogrim::xml;
use tokio_postgres::{Client, Row, RowStream};

use crate::{
    config::HttpHost,
    db::{self, types::EventTrack, util::{dbargs, impl_from_db, select, FromDb}},
    http::{response::{self, bad_request, internal_server_error, not_found}, Context, Response},
    model::Key,
    prelude::*
};

#[derive(Debug)]
struct Event {
    id: Key,
    title: String,
    description: Option<String>,
    created: DateTime<Utc>,
    creators: Vec<String>,
    thumbnail_url: Option<String>,
    tracks: Vec<EventTrack>,
}

impl_from_db!(
    Event,
    select: {
        events.{ id, title, description, creators, thumbnail, created, tracks },
    },
    |row| {
        Self {
            id: row.id(),
            title: row.title(),
            description: row.description(),
            created: row.created(),
            creators: row.creators(),
            thumbnail_url: row.thumbnail(),
            tracks: row.tracks(),
        }
    }
);

/// Generates the XML for an RSS feed of a series in Tobira.
pub(crate) async fn generate_series_feed(
    context: &Arc<Context>,
    id: &str,
) -> Result<String, Response> {
    let Some(series_id) = Key::from_base64(id) else {
        return Err(bad_request("invalid series ID"));
    };
    let db = db::get_conn_or_service_unavailable(&context.db_pool).await?;

    // Load series data
    let (selection, mapping) = select!(title, description);
    let query = format!("select {selection} from series where id = $1");
    let row = load_item(&db, &query, series_id).await?;
    let info = FeedInfo {
        title: mapping.title.of(&row),
        description: mapping.description.of::<Option<String>>(&row).unwrap_or_default(),
        link: format!("{}/!s/{id}", context.config.general.tobira_url),
    };

    // Load event data
    let selection = Event::select();
    let query = format!("select {selection} from events where series = $1");
    let events = db.query_raw(&query, dbargs![&series_id]).await.map_err(Into::into);

    generate_feed(context, format!("~rss/series/{id}"), info, events).await
}

/// Generates the XML for an RSS feed of a playlist in Tobira.
pub(crate) async fn generate_playlist_feed(
    context: &Arc<Context>,
    id: &str,
) -> Result<String, Response> {
    let Some(playlist_id) = Key::from_base64(id) else {
        return Err(bad_request("invalid playlist ID"));
    };
    let db = db::get_conn_or_service_unavailable(&context.db_pool).await?;

    // Load playlist data
    let (selection, mapping) = select!(title, description);
    let query = format!("select {selection} from playlists where id = $1");
    let row = load_item(&db, &query, playlist_id).await?;
    let info = FeedInfo {
        title: mapping.title.of(&row),
        description: mapping.description.of::<Option<String>>(&row).unwrap_or_default(),
        link: format!("{}/!p/{id}", context.config.general.tobira_url),
    };

    // Load event data
    let selection = Event::select();
    let query = format!("select {selection} from events \
        where opencast_id = any(event_entry_ids((\
            select entries from playlists where id = $1\
        )))",
    );
    let events = db.query_raw(&query, dbargs![&playlist_id]).await.map_err(Into::into);

    generate_feed(context, format!("~rss/playlist/{id}"), info, events).await
}

async fn load_item(db: &Client, query: &str, key: Key) -> Result<Row, Response> {
    match db.query_opt(query, &[&key]).await {
        Ok(Some(row)) => Ok(row),
        Ok(None) => Err(not_found()),
        Err(e) => {
            error!("DB error querying data for RSS: {e}");
            Err(internal_server_error())
        }
    }
}


struct FeedInfo {
    title: String,
    link: String,
    description: String,
}

async fn generate_feed(
    context: &Arc<Context>,
    rss_path: String,
    info: FeedInfo,
    event_rows: Result<RowStream, Error>,
) -> Result<String, Response> {
    let tobira_url = &context.config.general.tobira_url;
    let rss_link = format!("{tobira_url}/{rss_path}");

    let format = if cfg!(debug_assertions) {
        ogrim::Format::Pretty { indentation: "  " }
    } else {
        ogrim::Format::Terse
    };

    let buf = xml!(
        #[format = format]
        <?xml version="1.0" encoding="UTF-8"?>
        <rss
            version="2.0"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:content="http://purl.org/rss/1.0/modules/content/"
            xmlns:atom="http://www.w3.org/2005/Atom"
            xmlns:media="http://search.yahoo.com/mrss/"
            xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
        >
            <channel>
                <title>{info.title}</title>
                <link>{info.link}</link>
                <description>{info.description}</description>
                <language>"und"</language>
                <itunes:category text="Education" />
                <itunes:explicit>{&context.config.general.explicit_rss_content}</itunes:explicit>
                <itunes:image href={format!("{tobira_url}/~assets/logo-small.svg")} />
                <atom:link href={rss_link} rel="self" type="application/rss+xml" />
                {|buf| {
                    video_items(buf, event_rows, &info.title, &rss_link, &tobira_url)
                        .await
                        .map_err(|e| {
                            error!("Could not retrieve videos for RSS: {e}");
                            response::internal_server_error()
                        })?
                }}
            </channel>
        </rss>
    );

    Ok(buf.into_string())
}


/// Generates the single video items of a series in Tobira for inclusion in an RSS feed.
async fn video_items(
    doc: &mut ogrim::Document,
    event_rows: Result<RowStream, Error>,
    source_title: &str,
    rss_link: &str,
    tobira_url: &HttpHost,
) -> Result<(), Error> {

    fn map_tracks(tracks: &[EventTrack], doc: &mut ogrim::Document) {
        xml!(doc,
            <media:group>
                {|doc| for track in tracks {
                    xml!(doc,
                        <media:content
                            url={track.uri}
                            {..track.mimetype.as_ref().map(|t| ("type", t))}
                            {..track.resolution.into_iter().flat_map(|[w, h]| [("width", w), ("height", h)])}
                        />
                    )}
                }
            </media:group>
        )
    }

    event_rows?.try_for_each(|row| {
        let event = Event::from_row_start(&row);

        let mut buf = [0; 11];
        let tobira_event_id = event.id.to_base64(&mut buf);
        let event_link = format!("{tobira_url}/!v/{tobira_event_id}");
        let thumbnail = &event.thumbnail_url.unwrap_or_default();
        let creators = event.creators.join(", ");
        let (enclosure_track, track_groups) = preferred_tracks(event.tracks);

        xml!(doc,
            <item>
                <title>{event.title}</title>
                <link>{event_link}</link>
                <description>{event.description.unwrap_or_default()}</description>
                <dc:creator>{creators}</dc:creator>
                <pubDate>{event.created.to_rfc2822()}</pubDate>
                <guid>{event_link}</guid>
                <media:thumbnail url={thumbnail} />
                <itunes:image href={thumbnail} />
                <itunes:author>{creators}</itunes:author>
                <enclosure
                    url={&enclosure_track.uri}
                    type={&enclosure_track.mimetype.unwrap_or_default()}
                    length="0"
                />
                <source url={rss_link}>{source_title}</source>
                {|doc| for (_, tracks) in &track_groups {
                    map_tracks(tracks, doc)
                }}
            </item>
        );

        future::ready(Ok(()))
    }).await?;

    Ok(())
}



/// This returns a single track for use in the enclosure, that:
/// a) is a `presentation` track.
/// b) has a resolution that is closest to full hd.
/// Defaults to any track meeting the b) criteria if there is no `presentation` track.
/// It also returns a hashmap of all tracks grouped by their flavor.
fn preferred_tracks(tracks: Vec<EventTrack>) -> (EventTrack, HashMap<String, Vec<EventTrack>>) {
    let target_resolution = 1920 * 1080;

    let mut preferred_tracks: Vec<EventTrack> = tracks
        .iter()
        .filter(|track| track.flavor.contains("presentation"))
        .cloned()
        .collect();

    if preferred_tracks.is_empty() {
        preferred_tracks = tracks.clone();
    }

    let enclosure_track = preferred_tracks.iter().min_by_key(|&track| {
        let [w, h] = track.resolution.unwrap_or_default();
        (w * h - target_resolution).abs()
    }).expect("event without tracks");

    let mut track_groups: HashMap<String, Vec<EventTrack>> = HashMap::new();

    for track in &tracks {
        let flavor = track.flavor.clone();
        let entry = track_groups.entry(flavor).or_insert(Vec::new());
        entry.push(track.clone());
    }

    (enclosure_track.clone(), track_groups)
}
