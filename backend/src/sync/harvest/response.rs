use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    api::model::block::BlockType,
    db::types::{CustomActions, EventCaption, EventSegment, EventTrack},
    model::ExtraMetadata,
    sync::DeletionMode,
    Config,
};


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
    Event(Event),
    EventDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    Series(Series),
    SeriesDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    Playlist(Playlist),
    PlaylistDeleted {
        id: String,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        updated: DateTime<Utc>,
    },

    #[serde(untagged)]
    Unknown(serde_json::Value),
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub part_of: Option<String>,
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub created: DateTime<Utc>,
    pub creators: Vec<String>,
    pub duration: i64,
    pub tracks: Vec<Track>,
    #[serde(default)] // For backwards compatibility
    pub captions: Vec<Caption>,
    pub thumbnail: Option<String>,
    pub acl: Acl,
    pub is_live: bool,
    pub metadata: ExtraMetadata,
    #[serde(default, with = "chrono::serde::ts_milliseconds_option")]
    pub start_time: Option<DateTime<Utc>>,
    #[serde(default, with = "chrono::serde::ts_milliseconds_option")]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub updated: DateTime<Utc>,
    #[serde(default)]
    pub segments: Vec<Segment>,
    pub slide_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub acl: Acl,
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub updated: DateTime<Utc>,
    #[serde(default, with = "chrono::serde::ts_milliseconds_option")]
    pub created: Option<DateTime<Utc>>,
    #[serde(default)]
    pub metadata: ExtraMetadata,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub creator: Option<String>,
    pub acl: Acl,
    pub entries: Vec<PlaylistEntry>,
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub updated: DateTime<Utc>,
}

pub struct DeletedItemProps<'a> {
    pub table_name: &'static str,
    pub block_type: BlockType,
    pub id: &'a str,
    pub eager: bool,
}


impl HarvestItem {
    pub(crate) fn updated(&self) -> Option<DateTime<Utc>> {
        match self {
            Self::Event(event) => Some(event.updated),
            Self::EventDeleted { updated, .. } => Some(*updated),
            Self::Series(series) => Some(series.updated),
            Self::SeriesDeleted { updated, .. } => Some(*updated),
            Self::Playlist(playlist) => Some(playlist.updated),
            Self::PlaylistDeleted { updated, .. } => Some(*updated),
            Self::Unknown(_) => None,
        }
    }

    pub fn deleted_props<'a>(&'a self, config: &Config) -> Option<DeletedItemProps<'a>> {
        config.sync.auto_delete_pages.iter().find_map(|mode| {
            match (self, mode) {
                (HarvestItem::SeriesDeleted { id, .. }, DeletionMode::Series { eager }) => Some(
                    DeletedItemProps {
                        table_name: "series",
                        block_type: BlockType::Series,
                        id,
                        eager: *eager,
                    }
                ),
                (HarvestItem::EventDeleted { id, .. }, DeletionMode::Events { eager }) => Some(
                    DeletedItemProps {
                        table_name: "all_events",
                        block_type: BlockType::Video,
                        id,
                        eager: *eager,
                    }
                ),
                (HarvestItem::PlaylistDeleted { id, .. }, DeletionMode::Playlists { eager }) => Some(
                    DeletedItemProps {
                        table_name: "playlists",
                        block_type: BlockType::Playlist,
                        id,
                        eager: *eager,
                    }
                ),
                _ => None,
            }
        })
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
                HarvestItem::Series(Series {
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
                }),
                HarvestItem::Event(Event {
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
                }),

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
                HarvestItem::Series(Series {
                    id: "4b9c6f57-e4af-43dd-ad6e-fee3644fbef4".into(),
                    title: "Cats".into(),
                    description: None,
                    acl: Acl::default(),
                    updated: timestamp(1727866771932),
                    created: None,
                    metadata: ExtraMetadata::default(),
                }),
                HarvestItem::Event(Event {
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
                }),

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

    // Similar to the ones above, the first harvest output for a playlist.
    const PLAYLIST_RESPONSE: &str = include_str!("playlist-response-oldest.json");

    #[test]
    fn can_deserialize_playlist_response() {
        let deser = serde_json::from_str::<HarvestResponse>(PLAYLIST_RESPONSE).unwrap();
        assert_eq!(deser, HarvestResponse {
            includes_items_until: timestamp(1727883891896),
            has_more: false,
            items: vec![
                HarvestItem::Playlist(Playlist {
                    id: "1494cd19-cc43-4a2b-af29-b41d98d4e0d9".into(),
                    title: "Opencast Playlist".into(),
                    description: Some("This is a playlist about Opencast".into()),
                    creator: Some("Opencast".into()),
                    acl: Acl {
                        read: vec!["ROLE_USER_BOB".into()],
                        write: vec![],
                        preview: vec![],
                        custom_actions: CustomActions::default(),
                    },
                    entries: vec![
                        PlaylistEntry {
                            id: 1702,
                            ty: "E".into(),
                            content_id: "ID-about-opencast".into(),
                        },
                        PlaylistEntry {
                            id: 1703,
                            ty: "E".into(),
                            content_id: "ID-3d-print".into(),
                        },
                    ],
                    updated: timestamp(1727884054447),
                }),
                HarvestItem::PlaylistDeleted {
                    id: "eec06048-703d-40b1-a058-478f8bfc13f4".into(),
                    updated: timestamp(1727884054247),
                },
            ],
        });
    }
}
