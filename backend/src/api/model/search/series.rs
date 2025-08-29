use std::collections::HashMap;

use chrono::{DateTime, Utc};
use juniper::GraphQLObject;
use meilisearch_sdk::search::MatchRange;

use crate::{
    api::{Context, Id, Node, NodeValue},
    model::{SeriesThumbnailStack, ThumbnailInfo},
    search
};

use super::{field_matches_for, ByteSpan, SearchRealm};


#[derive(Debug, GraphQLObject)]
#[graphql(Context = Context, impl = NodeValue)]
pub(crate) struct SearchSeries {
    id: Id,
    opencast_id: String,
    title: String,
    description: Option<String>,
    host_realms: Vec<SearchRealm>,
    thumbnail_stack: SeriesThumbnailStack,
    matches: SearchSeriesMatches,
    created: Option<DateTime<Utc>>,
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
        src: search::Series,
        match_positions: Option<&HashMap<String, Vec<MatchRange>>>,
        context: &Context,
    ) -> Self {
        let matches = SearchSeriesMatches {
            title: field_matches_for(match_positions, "title"),
            description: field_matches_for(match_positions, "description"),
        };

        Self {
            id: Id::search_series(src.id.0),
            opencast_id: src.opencast_id,
            title: src.title,
            description: src.description,
            created: src.created,
            host_realms: src.host_realms.into_iter()
                .map(|r| SearchRealm::without_matches(r))
                .collect(),
            thumbnail_stack: SeriesThumbnailStack {
                thumbnails: src.thumbnails.into_iter()
                    .filter_map(|info| ThumbnailInfo::from_search(info, &context))
                    .take(3)
                    .collect(),
            },
            matches,
        }
    }
}
