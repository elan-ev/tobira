use std::{fmt, collections::HashMap};

use bytes::BytesMut;
use chrono::{DateTime, Utc};
use juniper::GraphQLEnum;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};


/// Our primary database ID type, which we call "key". In the database, it's a
/// `bigint` (`i64`), but we have a separate Rust type for it for several
/// reasons. Implements `ToSql` and `FromSql` by casting to/from `i64`.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub(crate) struct Key(pub(crate) u64);

impl ToSql for Key {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        (self.0 as i64).to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <i64 as ToSql>::accepts(ty)
    }

    postgres_types::to_sql_checked!();
}

impl<'a> FromSql<'a> for Key {
    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        i64::from_sql(ty, raw).map(|i| Key(i as u64))
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <i64 as FromSql>::accepts(ty)
    }
}

impl fmt::Debug for Key {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut buf = [0; 11];
        write!(f, "Key({} :: {})", self.0 as i64, self.to_base64(&mut buf))
    }
}


/// Represents the `event_track` type defined in `5-events.sql`.
#[derive(Debug, FromSql, ToSql, Clone)]
#[postgres(name = "event_track")]
pub struct EventTrack {
    pub uri: String,
    pub flavor: String,
    pub mimetype: Option<String>,
    pub resolution: Option<[i32; 2]>,
    pub is_master: Option<bool>,
}
/// Represents the `event_segment` type defined in `33-event-slide-text-and-segments.sql`.
#[derive(Debug, FromSql, ToSql)]
#[postgres(name = "event_segment")]
pub struct EventSegment {
    pub uri: String,
    pub start_time: i64,
}

/// Represents the `event_caption` type defined in `14-event-captions.sql`.
#[derive(Debug, FromSql, ToSql)]
#[postgres(name = "event_caption")]
pub struct EventCaption {
    pub uri: String,
    pub lang: Option<String>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "event_texts_queue")]
pub struct EventTextsQueueRecord {
    pub event_id: Key,
    pub fetch_after: DateTime<Utc>,
    pub retry_count: i32,
}

/// Represents the `event_state` type defined in `05-events.sql`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql)]
#[postgres(name = "event_state")]
pub enum EventState {
    #[postgres(name = "ready")]
    Ready,
    #[postgres(name = "waiting")]
    Waiting,
}


/// Represents the `series_state` type defined in `04-series.sql`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "series_state")]
#[graphql(description = "Represents the different states a series can be in during its lifecycle")]
pub enum SeriesState {
    #[postgres(name = "ready")]
    Ready,
    #[postgres(name = "waiting")]
    Waiting,
}

/// Represents the `playlist_entry_type` type defined in `31-playlists.sql`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql)]
#[postgres(name = "playlist_entry_type")]
pub enum PlaylistEntryType {
    #[postgres(name = "event")]
    Event,
}

/// Represents the `playlist_entry` type defined in `31-playlists.sql`.
#[derive(Debug, FromSql, ToSql, Clone)]
#[postgres(name = "playlist_entry")]
pub struct PlaylistEntry {
    pub entry_id: i64,
    #[postgres(name = "type")]
    pub ty: PlaylistEntryType,
    pub content_id: String,
}

/// Represents the `playlist_entry` type defined in `31-playlists.sql`.
#[derive(Debug, FromSql, ToSql, Clone, Serialize, Deserialize)]
#[postgres(name = "search_thumbnail_info")]
pub struct SearchThumbnailInfo {
    pub url: Option<String>,
    pub live: bool,
    pub audio_only: bool,
    pub read_roles: Vec<String>,
}

/// Represents the `timespan_text` type.
#[derive(Debug, FromSql, ToSql)]
#[postgres(name = "timespan_text")]
pub struct TimespanText {
    pub span_start: i64,
    pub span_end: i64,
    pub t: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "text_asset_type")]
pub enum TextAssetType {
    #[postgres(name = "caption")]
    Caption,
    #[postgres(name = "slide-text")]
    SlideText,
}


/// Represents extra metadata in the DB. Is a map from "namespace" to a
/// `string -> string array` map.
///
/// Each namespace key is a URL pointing to an XML namespace definition OR
/// `"dcterms"` for the dc terms (most common namespace). The value for each
/// namespace is a simple string-key map where each value is an array of string
/// values.
#[derive(Debug, Serialize, Deserialize, Default)]
#[cfg_attr(test, derive(PartialEq, Eq))]
pub(crate) struct ExtraMetadata {
    /// Metadata of the dcterms
    #[serde(default)]
    pub(crate) dcterms: MetadataMap,

    /// Extended metadata.
    #[serde(flatten)]
    pub(crate) extended: HashMap<String, MetadataMap>,
}

type MetadataMap = HashMap<String, Vec<String>>;

impl ToSql for ExtraMetadata {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        serde_json::to_value(self)
            .expect("failed to convert `ExtraMetadata` to JSON value")
            .to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <serde_json::Value as ToSql>::accepts(ty)
    }

    postgres_types::to_sql_checked!();
}

impl<'a> FromSql<'a> for ExtraMetadata {
    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        serde_json::from_value(<_>::from_sql(ty, raw)?).map_err(Into::into)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <serde_json::Value as FromSql>::accepts(ty)
    }
}

/// Represents the type for the `custom_action_roles` field from `32-custom-actions.sql`.
/// This holds a mapping of actions to lists holding roles that are allowed
/// to carry out the respective action.
#[derive(Debug, Serialize, Deserialize, Default)]
#[cfg_attr(test, derive(PartialEq, Eq))]
pub(crate) struct CustomActions(pub(crate) HashMap<String, Vec<String>>);

impl ToSql for CustomActions {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        serde_json::to_value(self)
            .expect("failed to convert `CustomActions` to JSON value")
            .to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <serde_json::Value as ToSql>::accepts(ty)
    }

    postgres_types::to_sql_checked!();
}

impl<'a> FromSql<'a> for CustomActions {
    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        serde_json::from_value(<_>::from_sql(ty, raw)?).map_err(Into::into)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <serde_json::Value as FromSql>::accepts(ty)
    }
}
