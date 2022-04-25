use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::db::types::EventTrack;


/// What the harvesting API returns.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct HarvestResponse {
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub(super) includes_items_until: DateTime<Utc>,
    pub(super) has_more: bool,
    pub(super) items: Vec<HarvestItem>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
#[serde(rename_all = "kebab-case")]
pub(super) enum HarvestItem {
    #[serde(rename_all = "camelCase")]
    Event {
        id: String,
        title: String,
        description: Option<String>,
        part_of: Option<String>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        created: DateTime<Utc>,
        creators: Vec<String>,
        duration: i32,
        tracks: Vec<Track>,
        thumbnail: Option<String>,
        acl: Acl,
        is_live: bool,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    #[serde(rename_all = "camelCase")]
    EventDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    #[serde(rename_all = "camelCase")]
    Series {
        id: String,
        title: String,
        description: Option<String>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    #[serde(rename_all = "camelCase")]
    SeriesDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },
}

impl HarvestItem {
    pub(super) fn updated(&self) -> DateTime<Utc> {
        match *self {
            Self::Event { updated, .. } => updated,
            Self::EventDeleted { updated, .. } =>  updated,
            Self::Series { updated, .. } => updated,
            Self::SeriesDeleted { updated, .. } => updated,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Track {
    uri: String,
    flavor: String,
    mimetype: Option<String>,
    resolution: Option<[i32; 2]>,
}

impl Into<EventTrack> for Track {
    fn into(self) -> EventTrack {
        EventTrack {
            uri: self.uri,
            flavor: self.flavor,
            mimetype: self.mimetype,
            resolution: self.resolution.map(Into::into),
        }
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct Acl {
    pub(super) read: Vec<String>,
    pub(super) write: Vec<String>,
}
