use std::{sync::Arc, future};
use chrono::{DateTime, Utc};
use deadpool_postgres::{GenericClient, Client};
use anyhow::{Error, Result};
use futures::TryStreamExt;
use xml_builder::{XMLBuilder, XMLElement, XMLVersion};

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
pub(crate) async fn generate_rss_feed(context: &Arc<Context>, id: &str) -> Result<String, Response> {
    let db_pool = &context.db_pool;
    let tobira_url = context.config.general.tobira_url();
    let series_link = format!("{}/!s/{}", tobira_url, id);
    let rss_link = format!("{}/~rss/series/{}", tobira_url, id);

    let Some(series_id) = Key::from_base64(id) else {
        return Err(bad_request("unknown series"));
    };
    
    let db = db::get_conn_or_service_unavailable(db_pool).await?;

    let query = "select opencast_id, title, description from series where id = $1";
    let series_data = match db.query_one(query, &[&series_id]).await {
        Ok(data) => data,
        Err(_) => return Err(bad_request("DB error querying series data")),
    };

    let series_oc_id = series_data.get::<_, String>("opencast_id");
    let series_title = series_data.get::<_, String>("title").clone();
    let series_description = series_data.get::<_, Option<String>>("description");
    let cover_image = context.config.theme.logo.large.path.clone();

    // Build rss xml
    let mut xml = XMLBuilder::new()
        .version(XMLVersion::XML1_0)
        .encoding("UTF-8".into())
        .build();

    let mut rss = XMLElement::new("rss");

    // Add rss attributes
    let attributes = [
        ("version", "2.0"),
        ("xmlns:dc", "http://purl.org/dc/elements/1.1/"),
        ("xmlns:content", "http://purl.org/rss/1.0/modules/content/"),
        ("xmlns:atom", "http://www.w3.org/2005/Atom"),
        ("xmlns:media", "http://search.yahoo.com/mrss/"),
        ("xmlns:itunes", "http://www.itunes.com/dtds/podcast-1.0.dtd"),
    ];
    for (name, value) in attributes {
        rss.add_attribute(name, value);
    }

    let mut channel = XMLElement::new("channel");

    // Add channel tags
    let channel_data = [
        ("title", vec![("", series_title.clone())]),
        ("link", vec![("", series_link)]),
        ("description", vec![("", series_description.unwrap_or_default())]),
        ("language", vec![("", "und".to_string())]),
        ("itunes:explicit",vec![("", "true".to_string())]),
        ("itunes:image", vec![("href", (&cover_image.to_string_lossy()).to_string())]),
        ("itunes:category", vec![("text", "Education".to_string())]),
        ("atom:link", vec![
            ("href", rss_link.clone()),
            ("rel", "self".to_string()),
            ("type", "application/rss+xml".to_string()),
        ]),
    ];
    add_elements_to_xml(&channel_data, &mut channel);

    // Add video items
    let video_items = match generate_video_items(
        &db, &series_oc_id, &series_title, &rss_link, &tobira_url).await {
        Ok(items) => items,
        Err(_) => return Err(bad_request("empty series")),
    };

    for item in video_items {
        // I have no idea how to correctly handle items that are resulting in an error.
        // Pretty sure however that this here is a bad solution and would result in
        // potentially broken feeds.
        let _ = channel.add_child(item);
    }

    rss.add_child(channel).unwrap();
    xml.set_root_element(rss);
    let mut writer: Vec<u8> = Vec::new();
    xml.generate(&mut writer).unwrap();

    let xml_string = String::from_utf8(writer).unwrap();
    
    Ok(xml_string)
}

/// Generates the single video items of a series in Tobira for inclusion in an RSS feed.
async fn generate_video_items(
    db: &Client,
    series_oc_id: &str,
    series_title: &str,
    rss_link: &str,
    tobira_url: &HttpHost,
) -> Result<Vec<XMLElement>, Error> {
    let selection = Event::select();
    let query = format!("select {selection} from events where part_of = $1");
    let rows = db.query_raw(&query, dbargs![&series_oc_id]).await?;

    let mut video_items: Vec<XMLElement> = Vec::new();

    rows.try_for_each(|row| {
        let event = Event::from_row_start(&row);
        
        let mut buf = [0; 11];
        let tobira_event_id = event.id.to_base64(&mut buf);
        let event_link = format!("{}/!v/{}", tobira_url, tobira_event_id);

        let preferred_track = choose_preferred_track(event.tracks).unwrap();
        let enclosure_url = &preferred_track.uri;
        let mimetype = &preferred_track.mimetype.unwrap();
        let thumbnail = &event.thumbnail_url.unwrap_or_default();

        let mut item = XMLElement::new("item");

        let item_data = [
            ("title", vec![("", event.title)]),
            ("link", vec![("", event_link.clone())]),
            ("description", vec![("", event.description.unwrap_or_default())]),
            ("dc:creator", vec![("", event.creators.join(", "))]),
            ("pubDate", vec![("", event.created.to_rfc2822())]),
            ("guid", vec![("", event_link)]),
            ("media:thumbnail", vec![("url", thumbnail.to_string())]),
            ("itunes:image", vec![("href", thumbnail.to_string())]),
            ("enclosure", vec![
                ("url", enclosure_url.to_string()),
                ("type", mimetype.to_string()),
                ("length", "0".to_string()),
            ]),
            ("source", vec![
                ("url", rss_link.to_string()),
                ("", series_title.to_string()),
            ]),
            ("media:content", vec![
                ("url", enclosure_url.to_string()),
                ("type", mimetype.to_string()),
            ]),
        ];
        add_elements_to_xml(&item_data, &mut item);

        video_items.push(item);
        future::ready(Ok(()))
    }).await?;

    Ok(video_items)
}


fn add_elements_to_xml(data: &[(&str, Vec<(&str, String)>)], target: &mut XMLElement) {
    for (element_name, attributes) in data {
        let mut element = XMLElement::new(element_name);

        for (attribute_name, text_content) in attributes {
            if !attribute_name.is_empty() {
                element.add_attribute(attribute_name, text_content);
            } else {
                element.add_text(text_content.to_string()).unwrap();
            }
        }

        target.add_child(element).unwrap();
    }
}


/// This returns a track that:
/// a) is a `presentation` track.
/// Defaults to any track meeting the b) criteria if there is no `presentation` track.
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


