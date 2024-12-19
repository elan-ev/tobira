use juniper::{graphql_object, GraphQLObject};
use meilisearch_sdk::search::SearchResult;

use crate::{
    api::{model::acl::{self, Acl}, Context, Id, Node, NodeValue},
    search::{self, util::decode_acl},
    HasRoles,
};

use super::{dbargs, field_matches_for, ApiResult, ByteSpan, SearchRealm, ThumbnailInfo};


#[derive(Debug)]
pub(crate) struct SearchSeries {
    id: Id,
    opencast_id: String,
    title: String,
    description: Option<String>,
    host_realms: Vec<SearchRealm>,
    thumbnails: Vec<ThumbnailInfo>,
    matches: SearchSeriesMatches,
    read_roles: Vec<String>,
    write_roles: Vec<String>,
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
        hit: SearchResult<search::Series>,
        context: &Context,
    ) -> Self {
        let match_positions = hit.matches_position.as_ref();
        let matches = SearchSeriesMatches {
            title: field_matches_for(match_positions, "title"),
            description: field_matches_for(match_positions, "description"),
        };

        let src = hit.result;
        Self {
            id: Id::search_series(src.id.0),
            opencast_id: src.opencast_id,
            title: src.title,
            description: src.description,
            read_roles: src.read_roles,
            write_roles: src.write_roles,
            host_realms: src.host_realms.into_iter()
                .map(|r| SearchRealm::without_matches(r))
                .collect(),
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

    async fn load_acl(&self, context: &Context) -> ApiResult<Acl> {
        let raw_roles_sql = "\
            select unnest($1::text[]) as role, 'read' as action
            union
            select unnest($2::text[]) as role, 'write' as action
        ";

        acl::load_for(context, raw_roles_sql, dbargs![
            &decode_acl(&self.read_roles),
            &decode_acl(&self.write_roles)
        ]).await
    }
}

#[graphql_object(Context = Context, impl = NodeValue)]
impl SearchSeries {
    fn id(&self) -> Id {
        Node::id(self)
    }
    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }
    fn title(&self) -> &str {
        &self.title
    }
    fn description(&self) -> Option<&String> {
        self.description.as_ref()
    }
    fn host_realms(&self) -> &[SearchRealm] {
        &self.host_realms
    }
    fn thumbnails(&self) -> &[ThumbnailInfo] {
        &self.thumbnails
    }
    fn matches(&self) -> &SearchSeriesMatches {
        &self.matches
    }
    async fn acl(&self, context: &Context) -> ApiResult<Acl> {
        self.load_acl(context).await
    }
}
