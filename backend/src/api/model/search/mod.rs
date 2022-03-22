use crate::{
    api::{
        Context,
        err::{ApiResult, ApiErrorKind, ApiError},
        NodeValue,
    },
    search,
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

    let event_results = context.search.event_index.search()
        .with_query(query)
        .with_limit(20)
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
