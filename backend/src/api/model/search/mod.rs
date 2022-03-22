use crate::{
    api::{
        Context,
        err::{ApiResult, ApiErrorKind, ApiError},
        NodeValue,
    },
    auth::HasRoles,
    search,
};


mod event;
// mod realm;


#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct SearchResults {
    items: Vec<NodeValue>,
}

pub(crate) async fn perform(
    user_query: &str,
    context: &Context,
) -> ApiResult<Option<SearchResults>> {
    if user_query.is_empty() {
        return Ok(None);
    }

    // If the user is not admin, build ACL filter: there has to be one user role
    // inside the event's ACL.
    let filter = if context.user.is_admin() {
        None
    } else {
        let filter = context.user.roles()
            .iter()
            .map(|role| format!("read_roles = '{}'", hex::encode(role)))
            .collect::<Vec<_>>()
            .join(" OR ");
        Some(filter)
    };

    // Actually perform the search.
    let mut query = context.search.event_index.search();
    query.with_query(user_query);
    query.with_limit(20);
    query.filter = filter.as_deref();
    let event_results = query.execute::<search::Event>().await?;

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
