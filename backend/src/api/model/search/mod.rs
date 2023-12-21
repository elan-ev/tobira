use once_cell::sync::Lazy;
use regex::Regex;
use std::{fmt, borrow::Cow};

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
mod series;


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
    pub(crate) items: Vec<T>,
    pub(crate) total_hits: Option<usize>,
}

#[juniper::graphql_object(Context = Context)]
impl SearchResults<NodeValue> {
    fn items(&self) -> &[NodeValue] {
        &self.items
    }
    fn total_hits(&self) -> Option<i32> {
        self.total_hits.map(|usize| usize as i32)
    }
}

#[juniper::graphql_object(Context = Context, name = "EventSearchResults")]
impl SearchResults<search::Event> {
    fn items(&self) -> &[search::Event] {
        &self.items
    }
}

#[juniper::graphql_object(Context = Context, name = "SeriesSearchResults")]
impl SearchResults<search::Series> {
    fn items(&self) -> &[search::Series] {
        &self.items
    }
}


macro_rules! handle_search_result {
    ($res:expr, $return_type:ty) => {{
        use meilisearch_sdk::errors::{
            Error as MsError,
            MeilisearchError as MsRespError,
            ErrorCode as MsErrorCode,
        };

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
            Err(e) => return ApiResult::Err(e.into()),
        }
    }};
}

pub(crate) use handle_search_result;


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
        let items: Vec<NodeValue> = context.db
            .query_opt(&query, &[&uuid_query, &context.auth.roles_vec()])
            .await?
            .map(|row| search::Event::from_row_start(&row).into())
            .into_iter()
            .collect();
        let total_hits = items.len();
        return Ok(SearchOutcome::Results(SearchResults { items, total_hits: Some(total_hits) }));
    }


    // Prepare the event search
    let filter = Filter::And(
        std::iter::once(Filter::Leaf("listed = true".into()))
            .chain(acl_filter("read_roles", context))
            .collect()
    ).to_string();
    let mut event_query = context.search.event_index.search();
    event_query.with_query(user_query);
    event_query.with_limit(15);
    event_query.with_show_matches_position(true);
    event_query.with_filter(&filter);
    event_query.with_show_ranking_score(true);



    // Prepare the realm search
    let realm_query = {
        let mut query = context.search.realm_index.search();
        query.with_query(user_query);
        query.with_limit(10);
        query.with_filter("is_user_realm = false");
        query.with_show_matches_position(true);
        query.with_show_ranking_score(true);
        query
    };


    // Perform the searches
    let res = tokio::try_join!(
        event_query.execute::<search::Event>(),
        realm_query.execute::<search::Realm>(),
    );
    let (event_results, realm_results) = handle_search_result!(res, SearchOutcome);

    // Merge results according to Meilis score.
    //
    // TODO: Comparing scores of differen indices is not well defined right now.
    // We can either use score details or adding dummy searchable fields to the
    // realm index. See this discussion for more info:
    // https://github.com/orgs/meilisearch/discussions/489#discussioncomment-6160361
    let events = event_results.hits.into_iter()
        .map(|result| (NodeValue::from(result.result), result.ranking_score));
    let realms = realm_results.hits.into_iter()
        .map(|result| (NodeValue::from(result.result), result.ranking_score));
    let mut merged = realms.chain(events).collect::<Vec<_>>();
    merged.sort_unstable_by(|(_, score0), (_, score1)| score1.unwrap().total_cmp(&score0.unwrap()));

    let total_hits: usize = [event_results.estimated_total_hits, realm_results.estimated_total_hits]
        .iter()
        .filter_map(|&x| x)
        .sum();

    let items = merged.into_iter().map(|(node, _)| node).collect();
    Ok(SearchOutcome::Results(SearchResults { items, total_hits: Some(total_hits) }))
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
    Results(SearchResults<search::Event>),
}

pub(crate) async fn all_events(
    user_query: &str,
    writable_only: bool,
    context: &Context,
) -> ApiResult<EventSearchOutcome> {
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    // All users can find all events they have write access to. If
    // `writable_only` is false, this API also returns events that are listed
    // and that the user can read.
    let writables = acl_filter("write_roles", context);
    let filter = if writable_only {
        writables.map(|f| f.to_string()).unwrap_or_default()
    } else {
        let listed_and_readable = Filter::And(
            std::iter::once(Filter::Leaf("listed = true".into()))
                .chain(acl_filter("read_roles", context))
                .collect()
        );

        Filter::Or(
            std::iter::once(listed_and_readable)
                .chain(writables)
                .collect()
        ).to_string()
    };

    let res = context.search.event_index.search()
        .with_query(user_query)
        .with_limit(50)
        .with_show_matches_position(true)
        .with_filter(&filter)
        .execute::<search::Event>()
        .await;
    let results = handle_search_result!(res, EventSearchOutcome);
    let items = results.hits.into_iter().map(|h| h.result).collect();
    let total_hits = results.estimated_total_hits.unwrap_or(0);

    Ok(EventSearchOutcome::Results(SearchResults { items, total_hits: Some(total_hits) }))
}

// See `EventSearchOutcome` for additional information.
#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum SeriesSearchOutcome {
    SearchUnavailable(SearchUnavailable),
    Results(SearchResults<search::Series>),
}

pub(crate) async fn all_series(
    user_query: &str,
    writable_only: bool,
    context: &Context,
) -> ApiResult<SeriesSearchOutcome> {
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    let filter = match (writable_only, context.auth.is_moderator(&context.config.auth)) {
        // If the writable_only flag is set, we filter by that only. All users
        // are allowed to find all series that they have write access to.
        (true, _) => acl_filter("write_roles", context)
            .map(|f| f.to_string())
            .unwrap_or(String::new()),

        // If the flag is not set and the user is moderator, all series are
        // searched.
        (false, true) => String::new(),

        // If the user is not moderator, they may only find listed series or
        // series they have write access to.
        (false, false) => {
            Filter::Or(
                std::iter::once(Filter::Leaf("listed = true".into()))
                    .chain(acl_filter("write_roles", context))
                    .collect()
            ).to_string()
        }
    };

    let res = context.search.series_index.search()
        .with_query(user_query)
        .with_show_matches_position(true)
        .with_filter(&filter)
        .with_limit(50)
        .execute::<search::Series>()
        .await;
    let results = handle_search_result!(res, SeriesSearchOutcome);
    let items = results.hits.into_iter().map(|h| h.result).collect();
    let total_hits = results.estimated_total_hits.unwrap_or(0);

    Ok(SeriesSearchOutcome::Results(SearchResults { items, total_hits: Some(total_hits) }))
}

fn acl_filter(action: &str, context: &Context) -> Option<Filter> {
    // If the user is admin, we just skip the filter alltogether as the admin
    // can see anything anyway.
    if context.auth.is_admin() {
        return None;
    }

    let operands = context.auth.roles().iter()
        .map(|role| Filter::Leaf(format!("{} = '{}'", action, hex::encode(role)).into()))
        .collect();
    Some(Filter::Or(operands))
}

enum Filter {
    And(Vec<Filter>),
    Or(Vec<Filter>),
    Leaf(Cow<'static, str>),
}

impl fmt::Display for Filter {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        fn join(f: &mut fmt::Formatter, operands: &[Filter], sep: &str) -> fmt::Result {
            write!(f, "(")?;
            for (i, operand) in operands.iter().enumerate() {
                if i > 0 {
                    write!(f, " {} ", sep)?;
                }
                write!(f, "{}", operand)?;
            }
            write!(f, ")")
        }

        match self {
            Self::And(operands) => join(f, operands, "AND"),
            Self::Or(operands) =>  join(f, operands, "OR"),
            Self::Leaf(s) => write!(f, "{s}"),
        }
    }
}
