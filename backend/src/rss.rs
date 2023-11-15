use std::{sync::Arc, future, collections::HashMap};
use chrono::{DateTime, Utc};
use deadpool_postgres::{GenericClient, Client};
use anyhow::{Error, Result};
use futures::TryStreamExt;
use ogrim::xml;

use crate::{
    db::{types::{EventTrack, Key}, self, util::{impl_from_db, FromDb, dbargs}},
    http::{Context, response::bad_request, Response},
    util::HttpHost,
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

/// Generates the xml for an RSS feed of a series in Tobira.
pub(crate) async fn generate_feed(context: &Arc<Context>, id: &str) -> Result<String, Response> {
    let db_pool = &context.db_pool;
    let tobira_url = context.config.general.tobira_url();
    let series_link = format!("{tobira_url}/!s/{id}");
    let rss_link = format!("{tobira_url}/~rss/series/{id}");

    let Some(series_id) = Key::from_base64(id) else {
        return Err(bad_request("invalid series ID"));
    };

    let db = db::get_conn_or_service_unavailable(db_pool).await?;

    let query = "select opencast_id, title, description from series where id = $1";
    let series_data = match db.query_one(query, &[&series_id]).await {
        Ok(data) => data,
        Err(_) => return Err(bad_request("DB error querying series data")),
    };

    let series_oc_id = series_data.get::<_, String>("opencast_id");
    let series_title = series_data.get::<_, String>("title").clone();
    let series_description = series_data
        .get::<_, Option<String>>("description")
        .unwrap_or_default();

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
                <title>{series_title}</title>
                <link>{series_link}</link>
                <description>{series_description}</description>
                <language>"und"</language>
                <itunes:category text="Education">
                    <itunes:category text="Courses"/>
                </itunes:category>
                <itunes:explicit>"true"</itunes:explicit>
                <itunes:image href={format!("{tobira_url}/~assets/logo-small.svg")} />
                <atom:link href={rss_link} rel="self" type="application/rss+xml" />
                {|buf| video_items(buf, &db, &series_oc_id, &series_title, &rss_link, tobira_url).await.unwrap()}
            </channel>
        </rss>
    );

    Ok(buf.into_string())
}

/// Generates the single video items of a series in Tobira for inclusion in an RSS feed.
async fn video_items(
    doc: &mut ogrim::Document,
    db: &Client,
    series_oc_id: &str,
    series_title: &str,
    rss_link: &str,
    tobira_url: &HttpHost,
) -> Result<(), Error> {
    let selection = Event::select();
    let query = format!("select {selection} from events where part_of = $1");
    let rows = db.query_raw(&query, dbargs![&series_oc_id]).await?;

    fn map_tracks(tracks: &Vec<EventTrack>, doc: &mut ogrim::Document) -> () {
        xml!(doc,
            <media:group>
                {|doc| for track in tracks {
                    xml!(doc,
                        <media:content
                            url={track.uri}
                            {..track.mimetype.clone().map(|t| ("type", t))}
                            {..track.resolution.into_iter().flat_map(|[w, h]| [("width", w), ("height", h)])}
                        />
                    )}
                }
            </media:group>
        )
    }

    rows.try_for_each(|row| {
        let event = Event::from_row_start(&row);
        
        let mut buf = [0; 11];
        let tobira_event_id = event.id.to_base64(&mut buf);
        let event_link = format!("{tobira_url}/!v/{tobira_event_id}");
        let thumbnail = &event.thumbnail_url.unwrap_or_default();
        let tracks = preferred_tracks(event.tracks);
        let enclosure_track = tracks.0.unwrap();
        let enclosure_url = &enclosure_track.uri;
        let mimetype = &enclosure_track.mimetype.unwrap();

        let track_groups = tracks.1;

        xml!(doc,
            <item>
                <title>{event.title}</title>
                <link>{event_link}</link>
                <description>{event.description.unwrap_or_default()}</description>
                <dc:creator>{event.creators.join(", ")}</dc:creator>
                <pubDate>{event.created.to_rfc2822()}</pubDate>
                <guid>{event_link}</guid>
                <media:thumbnail url={thumbnail} />
                <itunes:image href={thumbnail} />
                <enclosure
                    url={enclosure_url}
                    type={mimetype}
                    length="0"
                />
                <source url={rss_link}>{series_title}</source>
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
fn preferred_tracks(tracks: Vec<EventTrack>) -> (Option<EventTrack>, HashMap<String, Vec<EventTrack>>) {
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
        let track_resolution = track.resolution.unwrap_or_default();
        let diff = (track_resolution[0] * track_resolution[1] - target_resolution).abs();
        diff
    });

    let mut track_groups: HashMap<String, Vec<EventTrack>> = HashMap::new();

    for track in &tracks {
        let flavor = track.flavor.clone();
        let entry = track_groups.entry(flavor).or_insert(Vec::new());
        entry.push(track.clone());
    }

    (enclosure_track.cloned(), track_groups)
}


