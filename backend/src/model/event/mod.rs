use juniper::{GraphQLEnum, GraphQLObject};
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

use crate::{
    api::Context,
};
use super::ByteSpan;



/// Represents the `event_state` type defined in `05-events.sql`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, Serialize, Deserialize, GraphQLEnum)]
#[postgres(name = "event_state")]
pub enum EventState {
    #[postgres(name = "ready")]
    Ready,
    #[postgres(name = "waiting")]
    Waiting,
}


/// Information necessary to render a thumbnail.
#[derive(Debug, GraphQLObject, Clone)]
pub(crate) struct ThumbnailInfo {
    pub(crate) url: Option<String>,
    pub(crate) live: bool,
    pub(crate) audio_only: bool,
    pub(crate) state: EventState,
}

/// Thumbnail info with `read_roles` for deferred filtering. Represents the
/// `search_thumbnail_info` type defined in migration 47.
#[derive(Debug, FromSql, ToSql, Clone, Serialize, Deserialize)]
#[postgres(name = "search_thumbnail_info")]
pub struct SearchThumbnailInfo {
    pub url: Option<String>,
    pub live: bool,
    pub audio_only: bool,
    pub read_roles: Vec<String>,
    pub state: EventState,
}

impl ThumbnailInfo {
    pub(crate) fn from_search(info: SearchThumbnailInfo, context: &Context) -> Option<Self> {
        if context.auth.overlaps_roles(info.read_roles) {
            Some(Self {
                url: info.url,
                live: info.live,
                audio_only: info.audio_only,
                state: info.state,
            })
        } else {
            None
        }
    }
}


// ===== Text search =========================================================================

/// Different types of event assets containing searchable text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "text_asset_type")]
pub enum TextAssetType {
    #[postgres(name = "caption")]
    Caption,
    #[postgres(name = "slide-text")]
    SlideText,
}

/// A match inside an event's texts while searching.
#[derive(Debug, GraphQLObject)]
pub struct TextMatch {
    /// Start of this timespan in number of milliseconds from the beginning of
    /// the video.
    pub start: f64,

    /// Duration of this timespan in number of milliseconds.
    pub duration: f64,

    /// The text containing the match, with some context. Is `null` if the user
    /// is not allowed to read the event, but only preview it.
    pub text: Option<String>,

    /// Source of this text.
    pub ty: TextAssetType,

    /// Parts of `text` that should be highlighted.
    pub highlights: Vec<ByteSpan>,
}


/// A text associated with a timespan, representing the DB type `timespan_text`.
#[derive(Debug, FromSql, ToSql)]
#[postgres(name = "timespan_text")]
pub struct TimespanText {
    pub span_start: i64,
    pub span_end: i64,
    pub t: String,
}
