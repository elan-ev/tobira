use juniper::GraphQLObject;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

use crate::{
    api::Context,
    db::types::EventState,
};


/// Information necessary to render a thumbnail.
#[derive(Debug, GraphQLObject, Clone)]
pub(crate) struct ThumbnailInfo {
    pub(crate) url: Option<String>,
    pub(crate) live: bool,
    pub(crate) audio_only: bool,
    pub(crate) state: Option<String>,
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
                state: Some(match info.state {
                    EventState::Ready => "ready".into(),
                    EventState::Waiting => "waiting".into(),
                }),
            })
        } else {
            None
        }
    }
}
