use once_cell::sync::Lazy;
use regex::Regex;

use meilisearch_sdk::{
    errors::{
        Error as MsError,
        MeilisearchError as MsRespError,
        ErrorCode as MsErrorCode,
    },
    search::Query,
};

use crate::{
    api::{
        Context, NodeValue,
        err::ApiResult,
        util::impl_object_with_dummy_field,
    },
    auth::HasRoles,
    prelude::*,
    search,
};


mod event;
mod realm;

/// Marker type to signal that the search functionality is unavailable for some
/// reason.
pub(crate) struct SearchUnavailable;
impl_object_with_dummy_field!(SearchUnavailable);

/// Response to `search` endpoint when the query is empty.
pub(crate) struct EmptyQuery;
impl_object_with_dummy_field!(EmptyQuery);


/// Return type of the search API. `EmptyQuery` is only returned if the passed
/// search query is empty. `SearchUnavailable` is returned if the backend
/// search service is, for some reason, not available. Otherwise
/// `SearchResults` is returned.
#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum SearchOutcome {
    SearchUnavailable(SearchUnavailable),
    EmptyQuery(EmptyQuery),
    Results(SearchResults<NodeValue>),
}

pub(crate) struct SearchResults<T> {
    items: Vec<T>,
}

#[juniper::graphql_object(Context = Context)]
impl SearchResults<NodeValue> {
    fn items(&self) -> &[NodeValue] {
        &self.items
    }
}

#[juniper::graphql_object(Context = Context, name = "EventSearchResults")]
impl SearchResults<search::Event> {
    fn items(&self) -> &[search::Event] {
        &self.items
    }
}


macro_rules! handle_search_result {
    ($res:expr, $return_type:ty) => {
        match $res {
            Ok(v) => v,

            // We treat some errors in a special way because we kind of expect them
            // to happen. In those cases, we just say that the search is currently
            // unavailable, instead of the general error.
            Err(e @ MsError::Meilisearch(MsRespError { error_code: MsErrorCode::IndexNotFound, .. }))
            | Err(e @ MsError::UnreachableServer)
            | Err(e @ MsError::Timeout) => {
                error!("Meili search failed: {e} (=> replying 'search unavailable')");
                return Ok(<$return_type>::SearchUnavailable(SearchUnavailable));
            }

            // Catch when we can't serialize the JSON into our structs. This happens
            // when we change the search index schema and the index has not been
            // rebuilt yet. We also show "search unavailable" for this case.
            Err(MsError::ParseError(e)) if e.is_data() => {
                error!("Failed to deserialize search results (missing rebuild after update?): {e} \
                    (=> replying 'search uavailable')");
                return Ok(<$return_type>::SearchUnavailable(SearchUnavailable));
            }

            // All other errors just result in a general "internal server error".
            Err(e) => return Err(e.into()),
        }

    };
}


/// Main entry point for the main search (including all items).
pub(crate) async fn perform(
    user_query: &str,
    context: &Context,
) -> ApiResult<SearchOutcome> {
    if user_query.is_empty() {
        return Ok(SearchOutcome::EmptyQuery(EmptyQuery));
    }

    // Search for opencastId if applicable
    let uuid_query = user_query.trim();
    if looks_like_opencast_uuid(&uuid_query) {
        let selection = search::Event::select();
        let query = format!("select {selection} from search_events \
            where id = (select id from events where opencast_id = $1) \
            and (read_roles || 'ROLE_ADMIN'::text) && $2");
        let items = context.db
            .query_opt(&query, &[&uuid_query, &context.auth.roles_vec()])
            .await?
            .map(|row| search::Event::from_row_start(&row).into())
            .into_iter()
            .collect();
        return Ok(SearchOutcome::Results(SearchResults { items }));
    }


    // Prepare the event search
    let mut filter = "listed = true".to_string();
    let event_query = event_search_query(user_query, &mut filter, context);


    // Prepare the realm search
    let realm_query = {
        let mut query = context.search.realm_index.search();
        query.with_query(user_query);
        query.with_limit(10);
        query.with_show_matches_position(true);
        query
    };


    // Perform the searches
    let res = tokio::try_join!(
        event_query.execute::<search::Event>(),
        realm_query.execute::<search::Realm>(),
    );
    let (event_results, realm_results) = handle_search_result!(res, SearchOutcome);

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
                let mut relevancy = hit.matches_position
                    .expect("search result has no matches info")
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
    }, |realm| realm.name.as_ref()
        .map_or(false, |name| name.to_lowercase() == user_query.to_lowercase()));


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

    Ok(SearchOutcome::Results(SearchResults { items }))
}

fn looks_like_opencast_uuid(query: &str) -> bool {
    static RE: Lazy<Regex> = Lazy::new(|| Regex::new(
        "(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
    ).unwrap());

    RE.is_match(query)
}


// Unfortunately, Juniper's derives get confused when seeing generics. So we
// have to repeat the type definition here. But well, GraphQL also doesn't
// support generics, so we would need two types in the schema anyway.
#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum EventSearchOutcome {
    SearchUnavailable(SearchUnavailable),
    EmptyQuery(EmptyQuery),
    Results(SearchResults<search::Event>),
}

pub(crate) async fn all_events(user_query: &str, context: &Context) -> ApiResult<EventSearchOutcome> {
    context.require_moderator()?;

    if user_query.is_empty() {
        return Ok(EventSearchOutcome::EmptyQuery(EmptyQuery));
    }

    let mut filter = String::new();
    let mut event_query = event_search_query(user_query, &mut filter, context);
    event_query.with_limit(50);

    let res = event_query.execute::<search::Event>().await;
    let results = handle_search_result!(res, EventSearchOutcome);
    let items = results.hits.into_iter().map(|h| h.result).collect();

    Ok(EventSearchOutcome::Results(SearchResults { items }))
}


/// Constructs the appropriate `Query` to search for events. Due to a bad API
/// design of Meili, you have to pass an empty `String` as second parameter.
fn event_search_query<'a>(
    user_query: &'a str,
    filter: &'a mut String,
    context: &'a Context,
) -> Query<'a> {
    use std::fmt::Write;

    // If the user is not admin, build ACL filter: there has to be one user role
    // inside the event's ACL.
    if !context.auth.is_admin() {
        let acl_filter = context.auth.roles()
            .iter()
            .map(|role| format!("read_roles = '{}'", hex::encode(role)))
            .collect::<Vec<_>>()
            .join(" OR ");
        write!(
            filter,
            "{}({})",
            if filter.is_empty() { "" } else { " AND " },
            acl_filter,
        ).unwrap();
    };

    // Build search query
    let mut query = context.search.event_index.search();
    query.with_query(user_query);
    query.with_limit(15);
    query.with_show_matches_position(true);
    query.with_filter(filter);
    query
}

