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
mod realm;


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

    // Prepare the event search
    let mut acl_filter = None;
    let event_query = {
        // If the user is not admin, build ACL filter: there has to be one user role
        // inside the event's ACL.
        if !context.user.is_admin() {
            let filter = context.user.roles()
                .iter()
                .map(|role| format!("read_roles = '{}'", hex::encode(role)))
                .collect::<Vec<_>>()
                .join(" OR ");
            acl_filter = Some(filter);
        };

        // Build search query
        let mut query = context.search.event_index.search();
        query.with_query(user_query);
        query.with_limit(15);
        query.with_matches(true);
        query.filter = acl_filter.as_deref();
        query
    };


    // Prepare the realm search
    let realm_query = {
        let mut query = context.search.realm_index.search();
        query.with_query(user_query);
        query.with_limit(10);
        query.with_matches(true);
        query
    };


    // Perform the searches
    let (event_results, realm_results) = tokio::try_join!(
        event_query.execute::<search::Event>(),
        realm_query.execute::<search::Realm>(),
    )?;


    // Unfortunately, since Meili does not support multi-index search yet, and
    // since it does not provide any relevance score, we have to merge the
    // results ourselves. We derive a relevancy score by checking the matches.
    // This is absolutely not perfect, but it's a semi-useful, better than
    // random, deterministic way of ordering the results. Multi-index search in
    // Meili is planned, so hopefully we can get rid of this sometime soon.
    fn calc_relevancy<T, I, F, G>(
        results: I,
        field_weight: F,
        should_boost: G,
    ) -> impl Iterator<Item = (NodeValue, f64)>
    where
        NodeValue: From<T>,
        I: IntoIterator<Item = meilisearch_sdk::search::SearchResult<T>>,
        F: Fn(&str) -> f64,
        G: Fn(&T) -> bool,
    {
        results.into_iter()
            .map(move |hit| {
                let mut relevancy = hit.matches_info.expect("search result has no matches info")
                    .into_iter()
                    .map(|(field, matches)| {
                        // We weigh matches depending on what field was matched.
                        let weight = field_weight(&field);

                        // We rank the "quality" of the matches like this. Each
                        // match in itself is worth 2, but the longer the match,
                        // the better it is. Here we could definitely use a more
                        // sophisticated algorithm, also looking at the search
                        // query. But this should be fine for now.
                        let match_quality: usize = matches.into_iter().map(|m| m.length + 2).sum();

                        weight * match_quality as f64
                    })
                    .sum::<f64>();

                if should_boost(&hit.result) {
                    relevancy += 200.0;
                }

                (NodeValue::from(hit.result), relevancy)
            })
    }

    // Attach a relevancy score to each result, to be able to sort afterwards.
    let events = calc_relevancy(event_results.hits, |field| {
        match field {
            "title" => 10.0,
            "creators" => 3.0,
            "description" => 2.0,
            "series_title" => 1.0,
            _ => 0.0,
        }
    }, |event| event.title.to_lowercase() == user_query.to_lowercase());
    let realms = calc_relevancy(realm_results.hits, |field| {
        match field {
            "name" => 10.0,
            _ => 0.0,
        }
    }, |realm| realm.name.to_lowercase() == user_query.to_lowercase());


    // Merge and sort the results. We could simply sort by our own relevancy,
    // but that is definitely worse than the relevance sorting by Meili. So we
    // only want to use it to merge both lists together. The order of events
    // and realms is not changed. The multiplier help in breaking up larger
    // blocks of one kind.
    let mut items = Vec::new();
    let mut events = events.peekable();
    let mut realms = realms.peekable();
    let mut event_multiplier = 1.0;
    let mut realm_multiplier = 1.0;
    loop {
        match (events.peek(), realms.peek()) {
            (None, None) => break,
            (Some(_), None) => items.push(events.next().unwrap().0),
            (None, Some(_)) => items.push(realms.next().unwrap().0),
            (Some(event), Some(realm)) => {
                if event.1 * event_multiplier >= realm.1 * realm_multiplier {
                    items.push(events.next().unwrap().0);
                    event_multiplier *= 0.99;
                } else {
                    items.push(realms.next().unwrap().0);
                    realm_multiplier *= 0.99;
                }
            }
        }
    }

    Ok(Some(SearchResults { items }))
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
