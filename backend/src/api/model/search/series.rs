use juniper::GraphQLObject;

use crate::{
    api::{Context, Id, Node, NodeValue},
    search, HasRoles,
};

use super::{ByteSpan, ThumbnailInfo};


#[derive(Debug, GraphQLObject)]
#[graphql(Context = Context, impl = NodeValue)]
pub(crate) struct SearchSeries {
    id: Id,
    opencast_id: String,
    title: String,
    description: Option<String>,
    host_realms: Vec<search::Realm>,
    thumbnails: Vec<ThumbnailInfo>,
    matches: SearchSeriesMatches,
}


#[derive(Debug, GraphQLObject, Default)]
pub struct SearchSeriesMatches {
    title: Vec<ByteSpan>,
    description: Vec<ByteSpan>,
}

impl Node for SearchSeries {
    fn id(&self) -> Id {
        self.id
    }
}

impl SearchSeries {
    pub(crate) fn new(
        hit: meilisearch_sdk::SearchResult<search::Series>,
        context: &Context,
    ) -> Self {
        let match_positions = hit.matches_position.as_ref();
        let get_matches = |key: &str| match_positions
            .and_then(|m| m.get(key))
            .map(|v| v.as_slice())
            .unwrap_or_default();

        let field_matches = |key: &str| get_matches(key).iter()
            .map(|m| ByteSpan { start: m.start as i32, len: m.length as i32 })
            .take(8) // The frontend can only show a limited number anyway
            .collect();

        let matches = SearchSeriesMatches {
            title: field_matches("title"),
            description: field_matches("description"),
        };

        let src = hit.result;
        Self {
            id: Id::search_series(src.id.0),
            opencast_id: src.opencast_id,
            title: src.title,
            description: src.description,
            host_realms: src.host_realms,
            thumbnails: src.thumbnails.iter()
                .filter(|info| context.auth.overlaps_roles(&info.read_roles))
                .map(|info| ThumbnailInfo {
                    thumbnail: info.url.clone(),
                    audio_only: info.audio_only,
                    is_live: info.live,
                })
                .take(3)
                .collect(),
            matches,
        }
    }
}
