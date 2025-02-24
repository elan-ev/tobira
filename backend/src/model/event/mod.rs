use juniper::GraphQLObject;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

use crate::{auth::AuthContext, HasRoles};


/// Information necessary to render a thumbnail.
#[derive(Debug, GraphQLObject)]
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
    pub(crate) fn from_search(info: SearchThumbnailInfo, auth: &AuthContext) -> Option<Self> {
        if auth.overlaps_roles(info.read_roles) {
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
