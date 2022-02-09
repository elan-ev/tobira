use crate::{
    api::{
        Context,
        err::ApiResult,
        NodeValue,
    },
    prelude::*, db::types::EventTrack,
};


mod event;
mod realm;

pub(crate) use self::{
    event::SearchEvent,
    realm::SearchRealm,
};

use super::event::Track;


#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct SearchResults {
    items: Vec<NodeValue>,
}

pub(crate) async fn perform(query: &str, context: &Context) -> ApiResult<Option<SearchResults>> {
    if query.is_empty() {
        return Ok(None);
    }

    // TODO: all of this is only temporary until we use a proper search index
    let escaped_query = query.replace("_", "\\_").replace("%", "\\%");

    let events = {
        let sql = "select id, title, description, thumbnail, duration, tracks \
            from events \
            where title ilike '%' || $1 || '%' \
            and read_roles && $2 \
            limit 10";
        context.db.query_mapped(sql, dbargs![&escaped_query, &context.user.roles()], |row| {
            NodeValue::from(SearchEvent {
                key: row.get(0),
                title: row.get(1),
                description: row.get(2),
                thumbnail: row.get(3),
                duration: row.get(4),
                tracks: row.get::<_, Vec<EventTrack>>(5).into_iter().map(Track::from).collect(),
            })
        }).await?
    };

    let realms = {
        let sql = "select id, name, full_path \
            from realms \
            where name ilike '%' || $1 || '%' \
            limit 10";
        context.db.query_mapped(sql, dbargs![&escaped_query], |row| {
            NodeValue::from(SearchRealm {
                key: row.get(0),
                name: row.get(1),
                full_path: row.get(2),
            })
        }).await?
    };

    Ok(Some(SearchResults {
        items: realms.into_iter().chain(events).collect(),
    }))
}


