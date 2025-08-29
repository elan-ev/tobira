use juniper::GraphQLObject;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

use crate::{api::Context, HasRoles};


/// Information necessary to render a thumbnail.
#[derive(Debug, GraphQLObject, Clone)]
pub(crate) struct ThumbnailInfo {
    pub(crate) url: Option<String>,
    pub(crate) live: bool,
    pub(crate) audio_only: bool,
}

/// Thumbnail info with `read_roles` for deferred filtering. Represents the
/// `search_thumbnail_info` type defined in migration 37.
#[derive(Debug, FromSql, ToSql, Clone, Serialize, Deserialize)]
#[postgres(name = "search_thumbnail_info")]
pub struct SearchThumbnailInfo {
    pub url: Option<String>,
    pub live: bool,
    pub audio_only: bool,
    pub read_roles: Vec<String>,
}

impl ThumbnailInfo {
    pub(crate) fn from_search(info: SearchThumbnailInfo, context: &Context) -> Option<Self> {
        if context.auth.overlaps_roles(info.read_roles, &context.config.auth) {
            Some(Self {
                url: info.url,
                live: info.live,
                audio_only: info.audio_only,
            })
        } else {
            None
        }
    }
}
