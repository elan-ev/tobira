use crate::{
    api::{
        Context,
        err::{ApiResult, ApiErrorKind, ApiError},
        NodeValue,
    },
    auth::HasRoles,
    search::{self, hex_encode_roles},
};


mod event;
// mod realm;


#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct SearchResults {
    items: Vec<NodeValue>,
}

pub(crate) async fn perform(query: &str, context: &Context) -> ApiResult<Option<SearchResults>> {
    if query.is_empty() {
        return Ok(None);
    }

    // Build ACL filter: there has to be one user role inside the event's ACL.
    let user_roles = hex_encode_roles(context.user.roles());
    let filter = user_roles.into_iter()
        .map(|hex_role| format!("read_roles = '{hex_role}'"))
        .collect::<Vec<_>>()
        .join(" OR ");

    // Actually perform the search.
    let event_results = context.search.event_index.search()
        .with_query(query)
        .with_limit(20)
        .with_filter(&filter)
        .execute::<search::Event>()
        .await?;

    let events = event_results.hits.into_iter()
        .map(|result| NodeValue::from(result.result))
        .collect();


    Ok(Some(SearchResults { items: events }))
}

impl From<meilisearch_sdk::errors::Error> for ApiError {
    fn from(src: meilisearch_sdk::errors::Error) -> Self {
        Self {
            msg: format!("DB error: {src}"),
            kind: ApiErrorKind::InternalServerError,
            key: None,
        }
    }
}
