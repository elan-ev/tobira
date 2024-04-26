use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::db::types::{CustomActions, EventCaption, EventTrack, ExtraMetadata};


/// What the harvesting API returns.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HarvestResponse {
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub(crate) includes_items_until: DateTime<Utc>,
    pub(crate) has_more: bool,
    pub(crate) items: Vec<HarvestItem>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
#[serde(rename_all = "kebab-case")]
pub(crate) enum HarvestItem {
    #[serde(rename_all = "camelCase")]
    Event {
        id: String,
        title: String,
        description: Option<String>,
        part_of: Option<String>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        created: DateTime<Utc>,
        creators: Vec<String>,
        duration: i64,
        tracks: Vec<Track>,
        #[serde(default)] // For backwards compatibility
        captions: Vec<Caption>,
        thumbnail: Option<String>,
        acl: Acl,
        is_live: bool,
        metadata: ExtraMetadata,
        #[serde(with = "chrono::serde::ts_milliseconds_option")]
        start_time: Option<DateTime<Utc>>,
        #[serde(with = "chrono::serde::ts_milliseconds_option")]
        end_time: Option<DateTime<Utc>>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
        slide_text: Option<String>,
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
        acl: Acl,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        created: DateTime<Utc>,
        metadata: ExtraMetadata,
    },

    #[serde(rename_all = "camelCase")]
    SeriesDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    #[serde(untagged)]
    Unknown {
        kind: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },
}

impl HarvestItem {
    pub(crate) fn updated(&self) -> DateTime<Utc> {
        match *self {
            Self::Event { updated, .. } => updated,
            Self::EventDeleted { updated, .. } =>  updated,
            Self::Series { updated, .. } => updated,
            Self::SeriesDeleted { updated, .. } => updated,
            Self::Unknown { updated, .. } => updated,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Track {
    uri: String,
    flavor: String,
    mimetype: Option<String>,
    resolution: Option<[i32; 2]>,
    is_master: Option<bool>,
}

impl Into<EventTrack> for Track {
    fn into(self) -> EventTrack {
        EventTrack {
            uri: self.uri,
            flavor: self.flavor,
            mimetype: self.mimetype,
            resolution: self.resolution.map(Into::into),
            is_master: self.is_master,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Caption {
    uri: String,
    lang: Option<String>,
}

impl Into<EventCaption> for Caption {
    fn into(self) -> EventCaption {
        EventCaption {
            uri: self.uri,
            lang: self.lang,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Acl {
    #[serde(default)]
    pub(crate) read: Vec<String>,
    #[serde(default)]
    pub(crate) write: Vec<String>,
    #[serde(flatten)]
    pub(crate) custom_actions: CustomActions,
}
