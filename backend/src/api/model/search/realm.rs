use std::collections::HashMap;

use juniper::GraphQLObject;
use meilisearch_sdk::search::MatchRange;

use crate::{
    api::{Context, Node, Id, NodeValue},
    search,
};

use super::{field_matches_for, ByteSpan};

#[derive(Debug, GraphQLObject)]
#[graphql(Context = Context, impl = NodeValue)]
pub(crate) struct SearchRealm {
    id: Id,
    name: Option<String>,
    path: String,
    ancestor_names: Vec<Option<String>>,
    matches: SearchRealmMatches,
}


#[derive(Debug, GraphQLObject, Default)]
pub struct SearchRealmMatches {
    name: Vec<ByteSpan>,
}

impl Node for SearchRealm {
    fn id(&self) -> Id {
        self.id
    }
}


impl SearchRealm {
    pub(crate) fn without_matches(src: search::Realm) -> Self {
        Self::new_inner(src, SearchRealmMatches::default())
    }

    pub(crate) fn new(
        src: search::Realm,
        match_positions: Option<&HashMap<String, Vec<MatchRange>>>,
    ) -> Self {
        let matches = SearchRealmMatches {
            name: field_matches_for(match_positions, "name"),
        };
        Self::new_inner(src, matches)
    }

    fn new_inner(src: search::Realm, matches: SearchRealmMatches) -> Self {
        Self {
            id: Id::search_realm(src.id.0),
            name: src.name,
            path: if src.full_path.is_empty() { "/".into() } else { src.full_path },
            ancestor_names: src.ancestor_names,
            matches,
        }
    }
}
