use std::{sync::Arc, str::FromStr};
use chrono::{DateTime, Utc};
use deadpool_postgres::{GenericClient, Client};
use anyhow::{Error, Result};

use crate::{
    db::types::{EventTrack, Key},
    http::Context,
    api::Id,
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

/// Generates the xml for an RSS feed of a series in Tobira.
pub(crate) async fn generate_rss_feed(context: &Arc<Context>, id: &str) -> Result<String, Error> {
    let db_pool = &context.db_pool;
    let tobira_url = context.config.opencast.tobira_url();
    let series_link = format!("{}/!s/{}", tobira_url, id);
    let rss_link = format!("{}/~rss/series/{}", tobira_url, id);
    let id_string = format!("sr{}", id);
    let series_id = Id::from_str(&id_string).unwrap().key_for(Id::SERIES_KIND).unwrap();
    
    let db = db_pool.get().await?;
    let query = "select opencast_id, title, description from series where id = $1";
    let series_data = db.query_one(query, &[&series_id]).await?;
    let series_oc_id = series_data.get::<_, String>("opencast_id");
    let series_title = series_data.get::<_, String>("title");
    let series_description = series_data.get::<_, Option<String>>("description");

    let video_items_result = generate_video_items(
        &db,
        &series_oc_id,
        &series_title,
        &rss_link,
        &tobira_url,
    );
    
    let rss_content = video_items_result
        .await
        .map(|video_items| {
            format!(
                r#"<?xml version="1.0" encoding="UTF-8" ?>
                <rss
                    version="2.0"
                    xmlns:dc="http://purl.org/dc/elements/1.1/"
                    xmlns:atom="http://www.w3.org/2005/Atom"
                    xmlns:media="http://search.yahoo.com/mrss/"
                >
                <channel>
                    <title>{}</title>
                    <link>{}</link>
                    <description>{}</description>
                    <atom:link href="{}" rel="self" type="application/rss+xml" />
                    {}
                </channel>
                </rss>"#,
                series_title,
                series_link,
                series_description.unwrap_or_default(),
                rss_link,
                video_items
            )
        })
        .map_err(|error| Error::msg(format!("Error generating video items: {:?}", error)));
        
    rss_content
}

/// Generates the single video items of a series in Tobira for inclusion in an RSS feed.
async fn generate_video_items(
    db: &Client,
    series_oc_id: &str,
    series_title: &str,
    rss_link: &str,
    tobira_url: &str,
) -> Result<String, Error> {
    let events = gather_event_data(&db, &series_oc_id).await?;

    let mut video_items = String::new();

    for event in events {
        let mut buf = [0; 11];
        let tobira_event_id = event.id.to_base64(&mut buf);
        let event_link = format!("{}/!v/{}", tobira_url, tobira_event_id);

        let preferred_track = choose_preferred_track(event.tracks).unwrap();

        let enclosure_url = &preferred_track.uri;
        let mimetype = &preferred_track.mimetype.unwrap();

        let item = format!(
            r#"
            <item>
              <title>{}</title>
              <link>{}</link>
              <description>{}</description>
              <dc:creator>{}</dc:creator>
              <enclosure url="{}" type="{}" length="0" />
              <guid isPermaLink="true">{}</guid>
              <pubDate>{}</pubDate>
              <source url="{}">{}</source>
              <media:thumbnail url="{}" />
              <media:content url="{}" type="{}" />
            </item>"#,
            event.title,
            event_link,
            event.description.unwrap_or_default(),
            event.creators.join(", "),
            enclosure_url,
            mimetype,
            event_link,
            event.created.to_rfc2822(),
            rss_link,
            series_title,
            event.thumbnail_url.unwrap_or_default(),
            enclosure_url,
            mimetype,
        );

        video_items.push_str(&item);
    }

    Ok(video_items)
}

// Gathers the needed event data for video items to include in an RSS feed of a series in Tobira.
async fn gather_event_data(db: &Client, series_id: &str) -> Result<Vec<Event>, Error> {
    let query = format!("\
        select id, title, description, created, creators, thumbnail, tracks \
        from events \
        where part_of = $1",
    );
    let rows = db.query(&query, &[&series_id]).await?;

    let mut events = Vec::new();

    for row in rows {
        let id = row.get::<_, Key>("id");
        let title = row.get("title");
        let description = row.get("description");
        let created = row.get("created");
        let creators = row.get("creators");
        let thumbnail_url = row.get("thumbnail");
        let tracks = row.get("tracks");

        let event = Event {
            id,
            title,
            description,
            created,
            creators,
            thumbnail_url,
            tracks,
        };

        events.push(event);
    }

    Ok(events)
}

/// This returns a track that:
/// a) is the `presentation`` track.
/// Defaults to any track meeting the b) criteria if none there is no `presentation` track.
/// b) has a resolution that is closest to full hd.
fn choose_preferred_track(tracks: Vec<EventTrack>) -> Option<EventTrack> {
    let target_resolution = tracks.first().map_or([1920, 1080], |first_track| {
        let [x, y] = first_track.resolution.unwrap();
        if x >= y {
            [1920, 1080] // Landscape
        } else {
            [1080, 1920] // Portrait
        }
    });

    let mut tracks_to_check: Vec<EventTrack> = tracks
        .iter()
        .filter(|track| track.flavor.contains("presentation"))
        .cloned()
        .collect();

    if tracks_to_check.is_empty() {
        tracks_to_check = tracks.clone();
    }

    let preferred_track = tracks_to_check.iter().min_by_key(|&track| {
        let track_resolution = track.resolution.unwrap();
        let diff_x = (track_resolution[0] - target_resolution[0]).abs();
        let diff_y = (track_resolution[1] - target_resolution[1]).abs();
        diff_x + diff_y
    });

    preferred_track.cloned()
}


