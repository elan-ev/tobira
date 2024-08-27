use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::db::types::{CustomActions, EventCaption, EventTrack, EventSegment, ExtraMetadata};


/// What the harvesting API returns.
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub(crate) struct HarvestResponse {
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub(crate) includes_items_until: DateTime<Utc>,
    pub(crate) has_more: bool,
    pub(crate) items: Vec<HarvestItem>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
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
        #[serde(default, with = "chrono::serde::ts_milliseconds_option")]
        start_time: Option<DateTime<Utc>>,
        #[serde(default, with = "chrono::serde::ts_milliseconds_option")]
        end_time: Option<DateTime<Utc>>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
        #[serde(default)]
        segments: Vec<Segment>,
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
        #[serde(default, with = "chrono::serde::ts_milliseconds_option")]
        created: Option<DateTime<Utc>>,
        #[serde(default)]
        metadata: ExtraMetadata,
    },

    #[serde(rename_all = "camelCase")]
    SeriesDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    #[serde(rename_all = "camelCase")]
    Playlist {
        id: String,
        title: String,
        description: Option<String>,
        creator: Option<String>,
        acl: Acl,
        entries: Vec<PlaylistEntry>,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    #[serde(rename_all = "camelCase")]
    PlaylistDeleted {
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
            Self::Playlist { updated, .. } => updated,
            Self::PlaylistDeleted { updated, .. } => updated,
            Self::Unknown { updated, .. } => updated,
        }
    }
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
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
#[cfg_attr(test, derive(PartialEq, Eq))]
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

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub(crate) struct Segment {
    uri: String,
    start_time: i64
}

impl Into<EventSegment> for Segment {
    fn into(self) -> EventSegment {
        EventSegment {
            uri: self.uri,
            start_time: self.start_time,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[cfg_attr(test, derive(PartialEq, Eq))]
pub(crate) struct Acl {
    #[serde(default)]
    pub(crate) read: Vec<String>,
    #[serde(default)]
    pub(crate) write: Vec<String>,
    #[serde(default)]
    pub(crate) preview: Vec<String>,
    #[serde(flatten)]
    pub(crate) custom_actions: CustomActions,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaylistEntry {
    pub id: i64,
    #[serde(rename = "type")]
    pub ty: String,
    pub content_id: String,
}


#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use super::*;


    fn timestamp(ts: u64) -> DateTime<Utc> {
        DateTime::from_timestamp(ts as i64 / 1000, (ts % 1000) as u32 * 1000_000).unwrap()
    }


    // Makes sure that Tobira can still deserialize a harvest response by the
    // `MIN_REQUIRED_API_VERSION`. Otherwise, we would have to bump that
    // version.
    const OLDEST_SUPPORTED_RESPONSE: &str = include_str!("v1.0-response.json");

    #[test]
    fn can_deserialize_oldest_supported_response() {
        let deser = serde_json::from_str::<HarvestResponse>(OLDEST_SUPPORTED_RESPONSE).unwrap();
        assert_eq!(deser, HarvestResponse {
            includes_items_until: timestamp(1727867693398),
            has_more: false,
            items: vec![
                HarvestItem::Series {
                    id: "4b9c6f57-e4af-43dd-ad6e-fee3644fbef4".into(),
                    title: "Cats".into(),
                    description: Some("Several videos of cats".into()),
                    acl: Acl {
                        preview: vec![],
                        read: vec!["ROLE_ANONYMOUS".into()],
                        write: vec!["ROLE_ANONYMOUS".into()],
                        custom_actions: CustomActions::default(),
                    },
                    updated: timestamp(1727866771932),
                    created: None,
                    metadata: ExtraMetadata::default(),
                },
                HarvestItem::Event {
                    id: "002cff10-e0c2-4f0a-a06d-1e5c8dfef13c".into(),
                    title: "Video Of A Tabby Cat".into(),
                    description: None,
                    acl: Acl {
                        preview: vec![],
                        read: vec!["ROLE_ADMIN".into(), "ROLE_ANONYMOUS".into()],
                        write: vec!["ROLE_ADMIN".into()],
                        custom_actions: CustomActions::default(),
                    },
                    updated: timestamp(1727866860840),
                    created: timestamp(1727866740000),
                    creators: vec!["Pixabay".to_owned()],
                    metadata: ExtraMetadata {
                        dcterms: HashMap::from([
                            ("license".to_owned(), vec!["CC0".to_owned()]),
                        ]),
                        ..ExtraMetadata::default()
                    },
                    part_of: Some("4b9c6f57-e4af-43dd-ad6e-fee3644fbef4".into()),
                    thumbnail: Some("http://localhost:8080/static/mh_default_org/engage-player/002cff10\
                        -e0c2-4f0a-a06d-1e5c8dfef13c/11566598-693b-4f94-9787-5d420be66a3d/cat-bokeh\
                        -x265-480p_1.000s-player.jpg".into()),
                    slide_text: None,
                    duration: 11440,
                    is_live: false,
                    start_time: None,
                    end_time: None,
                    tracks: vec![
                        Track {
                            uri: "http://localhost:8080/static/mh_default_org/engage-player/\
                                002cff10-e0c2-4f0a-a06d-1e5c8dfef13c/7547400e-d872-4bd1-bd63-\
                                7af340865ae5/cat-bokeh-x265-480p.mp4".into(),
                            flavor: "presenter/preview".into(),
                            mimetype: Some("video/mp4".into()),
                            resolution: Some([854, 480]),
                            is_master: None,
                        }
                    ],
                    captions: vec![],
                    segments: vec![],
                },

                HarvestItem::SeriesDeleted {
                    id: "eec06048-703d-40b1-a058-478f8bfc13f4".into(),
                    updated: timestamp(1727867627087),
                },
                HarvestItem::EventDeleted {
                    id: "ef29ba59-2e8e-4949-acaf-8b8e42bed37e".into(),
                    updated: timestamp(1727867851377),
                }
            ],
        });
    }

    // Similar to the one above, but trimming it down to the minimal number of
    // fields specified.
    const MINIMAL_RESPONSE: &str = include_str!("minimal-response.json");

    #[test]
    fn can_deserialize_minimal_response() {
        let deser = serde_json::from_str::<HarvestResponse>(MINIMAL_RESPONSE).unwrap();
        assert_eq!(deser, HarvestResponse {
            includes_items_until: timestamp(1727867693398),
            has_more: false,
            items: vec![
                HarvestItem::Series {
                    id: "4b9c6f57-e4af-43dd-ad6e-fee3644fbef4".into(),
                    title: "Cats".into(),
                    description: None,
                    acl: Acl::default(),
                    updated: timestamp(1727866771932),
                    created: None,
                    metadata: ExtraMetadata::default(),
                },
                HarvestItem::Event {
                    id: "002cff10-e0c2-4f0a-a06d-1e5c8dfef13c".into(),
                    title: "Video Of A Tabby Cat".into(),
                    description: None,
                    acl: Acl::default(),
                    updated: timestamp(1727866860840),
                    created: timestamp(1727866740000),
                    creators: vec!["Pixabay".to_owned()],
                    metadata: ExtraMetadata::default(),
                    part_of: None,
                    thumbnail: None,
                    slide_text: None,
                    duration: 11440,
                    is_live: false,
                    start_time: None,
                    end_time: None,
                    tracks: vec![],
                    captions: vec![],
                    segments: vec![],
                },

                HarvestItem::SeriesDeleted {
                    id: "eec06048-703d-40b1-a058-478f8bfc13f4".into(),
                    updated: timestamp(1727867627087),
                },
                HarvestItem::EventDeleted {
                    id: "ef29ba59-2e8e-4949-acaf-8b8e42bed37e".into(),
                    updated: timestamp(1727867851377),
                }
            ],
        });
    }
}
