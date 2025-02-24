use std::collections::HashMap;

use bytes::BytesMut;
use chrono::{DateTime, Utc};
use juniper::GraphQLEnum;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

use crate::model::Key;


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

#[derive(Debug, ToSql, FromSql)]
#[postgres(name = "credentials")]
pub(crate) struct Credentials {
    pub(crate) name: String,
    pub(crate) password: String,
}
