use chrono::{DateTime, Utc};
use juniper::GraphQLObject;
use once_cell::sync::Lazy;
use regex::Regex;
use std::{borrow::Cow, fmt};

use crate::{
    api::{
        err::ApiResult,
        util::impl_object_with_dummy_field,
        Context,
        NodeValue
    },
    auth::HasRoles,
    prelude::*,
    search,
};


mod event;
mod realm;
mod series;
mod playlist;

pub(crate) use self::event::{SearchEvent, TextMatch, ByteSpan};


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
    pub(crate) total_hits: usize,
}

#[juniper::graphql_object(Context = Context)]
impl SearchResults<NodeValue> {
    fn items(&self) -> &[NodeValue] {
        &self.items
    }
    fn total_hits(&self) -> i32 {
        self.total_hits as i32
    }
}

#[juniper::graphql_object(Context = Context, name = "EventSearchResults")]
impl SearchResults<SearchEvent> {
    fn items(&self) -> &[SearchEvent] {
        &self.items
    }
}

#[juniper::graphql_object(Context = Context, name = "SeriesSearchResults")]
impl SearchResults<search::Series> {
    fn items(&self) -> &[search::Series] {
        &self.items
    }
}

#[juniper::graphql_object(Context = Context, name = "PlaylistSearchResults")]
impl SearchResults<search::Playlist> {
    fn items(&self) -> &[search::Playlist] {
        &self.items
    }
}

#[derive(Debug, Clone, Copy, juniper::GraphQLEnum)]
enum ItemType {
   Event,
   Series,
   Realm,
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct Filters {
    item_type: Option<ItemType>,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
}

#[derive(Debug, GraphQLObject)]
pub(crate) struct ThumbnailInfo {
    pub(crate) thumbnail: Option<String>,
    pub(crate) is_live: bool,
    pub(crate) audio_only: bool,
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
                    (=> replying 'search unavailable')");
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
    filters: Filters,
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
            .map(|row| {
                let e = search::Event::from_row_start(&row);
                SearchEvent::new(e, &[], &[]).into()
            })
            .into_iter()
            .collect();
        let total_hits = items.len();
        return Ok(SearchOutcome::Results(SearchResults { items, total_hits }));
    }


    // Prepare the event search
    let filter = Filter::And(
        std::iter::once(Filter::Leaf("listed = true".into()))
            .chain(acl_filter("read_roles", context))
            // Filter out live events that are already over.
            .chain([Filter::Or([
                Filter::Leaf("is_live = false ".into()),
                Filter::Leaf(format!("end_time_timestamp >= {}", Utc::now().timestamp()).into()),
            ].into())])
            .chain(filters.start.map(|start| Filter::Leaf(format!("created_timestamp >= {}", start.timestamp()).into())))
            .chain(filters.end.map(|end| Filter::Leaf(format!("created_timestamp <= {}", end.timestamp()).into())))
            .collect()
    ).to_string();
    let event_query = context.search.event_index.search()
        .with_query(user_query)
        .with_limit(15)
        .with_show_matches_position(true)
        .with_filter(&filter)
        .with_show_ranking_score(true)
        .build();


    // Prepare the series search
    let series_query = context.search.series_index.search()
        .with_query(user_query)
        .with_show_matches_position(true)
        .with_filter("listed = true")
        .with_limit(15)
        .with_show_ranking_score(true)
        .build();


    // Prepare the realm search
    let realm_query = context.search.realm_index.search()
        .with_query(user_query)
        .with_limit(10)
        .with_filter("is_user_realm = false")
        .with_show_matches_position(true)
        .with_show_ranking_score(true)
        .build();


    // Perform the searches
    let res = tokio::try_join!(
        event_query.execute::<search::Event>(),
        series_query.execute::<search::Series>(),
        realm_query.execute::<search::Realm>(),
    );
    let (event_results, series_results, realm_results) = handle_search_result!(res, SearchOutcome);

    // Merge results according to Meilis score.
    //
    // TODO: Comparing scores of different indices is not well defined right now.
    // We can either use score details or adding dummy searchable fields to the
    // realm index. See this discussion for more info:
    // https://github.com/orgs/meilisearch/discussions/489#discussioncomment-6160361
    let events = event_results.hits.into_iter().map(|result| {
        let score = result.ranking_score;
        (NodeValue::from(hit_to_search_event(result)), score)
    });
    let series = series_results.hits.into_iter()
        .map(|result| (NodeValue::from(result.result), result.ranking_score));
    let realms = realm_results.hits.into_iter()
        .map(|result| (NodeValue::from(result.result), result.ranking_score));

    let mut merged: Vec<(NodeValue, Option<f64>)> = Vec::new();
    let total_hits: usize;

    match filters.item_type {
        Some(ItemType::Event) => {
            merged.extend(events);
            total_hits = event_results.estimated_total_hits.unwrap_or(0);
        },
        Some(ItemType::Series) => {
            merged.extend(series);
            total_hits = series_results.estimated_total_hits.unwrap_or(0);
        },
        Some(ItemType::Realm) => {
            merged.extend(realms);
            total_hits = realm_results.estimated_total_hits.unwrap_or(0);
        },
        None => {
            merged.extend(events);
            merged.extend(series);
            merged.extend(realms);
            total_hits = [
                event_results.estimated_total_hits,
                series_results.estimated_total_hits,
                realm_results.estimated_total_hits,
            ]
                .iter()
                .filter_map(|&x| x)
                .sum();
        },
    }

    merged.sort_unstable_by(|(_, score0), (_, score1)| score1.unwrap().total_cmp(&score0.unwrap()));

    let items = merged.into_iter().map(|(node, _)| node).collect();
    Ok(SearchOutcome::Results(SearchResults { items, total_hits }))
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
    Results(SearchResults<SearchEvent>),
}

pub(crate) async fn all_events(
    user_query: &str,
    writable_only: bool,
    context: &Context,
) -> ApiResult<EventSearchOutcome> {
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    let filter = Filter::make_or_none_for_admins(context, || {
        // All users can always find all events they have write access to. If
        // `writable_only` is false, this API also returns events that are
        // listed and that the user can read.
        let writable = Filter::acl_access("write_roles", context);
        if writable_only {
            writable
        } else {
            Filter::or([Filter::listed_and_readable(context), writable])
        }
    }).to_string();

    let mut query = context.search.event_index.search();
    query.with_query(user_query);
    query.with_limit(50);
    query.with_show_matches_position(true);
    query.with_filter(&filter);
    if user_query.is_empty() {
        query.with_sort(&["updated_timestamp:desc"]);
    }
    let res = query.execute::<search::Event>().await;
    let results = handle_search_result!(res, EventSearchOutcome);
    let items = results.hits.into_iter().map(|h| hit_to_search_event(h)).collect();
    let total_hits = results.estimated_total_hits.unwrap_or(0);

    Ok(EventSearchOutcome::Results(SearchResults { items, total_hits }))
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

    let filter = Filter::make_or_none_for_admins(context, || {
        let writable = Filter::acl_access("write_roles", context);

        // All users can always find all items they have write access to,
        // regardless whether they are listed or not.
        if writable_only {
            return writable;
        }

        // Since series read_roles are not used for access control, we only need
        // to check whether we can return unlisted videos.
        if context.auth.can_find_unlisted_items(&context.config.auth) {
            Filter::None
        } else {
            Filter::or([writable, Filter::listed()])
        }
    }).to_string();

    let mut query = context.search.series_index.search();
    query.with_query(user_query);
    query.with_show_matches_position(true);
    query.with_filter(&filter);
    query.with_limit(50);
    if user_query.is_empty() {
        query.with_sort(&["updated_timestamp:desc"]);
    }
    let res = query.execute::<search::Series>().await;
    let results = handle_search_result!(res, SeriesSearchOutcome);
    let items = results.hits.into_iter().map(|h| h.result).collect();
    let total_hits = results.estimated_total_hits.unwrap_or(0);

    Ok(SeriesSearchOutcome::Results(SearchResults { items, total_hits }))
}

#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum PlaylistSearchOutcome {
    SearchUnavailable(SearchUnavailable),
    Results(SearchResults<search::Playlist>),
}

pub(crate) async fn all_playlists(
    user_query: &str,
    writable_only: bool,
    context: &Context,
) -> ApiResult<PlaylistSearchOutcome> {
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    let filter = Filter::make_or_none_for_admins(context, || {
        // All users can always find all playlists they have write access to. If
        // `writable_only` is false, this API also returns playlists that are
        // listed and that the user can read.
        let writable = Filter::acl_access("write_roles", context);
        if writable_only {
            writable
        } else {
            Filter::or([Filter::listed_and_readable(context), writable])
        }
    }).to_string();

    let mut query = context.search.playlist_index.search();
    query.with_query(user_query);
    query.with_show_matches_position(true);
    query.with_filter(&filter);
    query.with_limit(50);
    if user_query.is_empty() {
        query.with_sort(&["updated_timestamp:desc"]);
    }
    let res = query.execute::<search::Playlist>().await;
    let results = handle_search_result!(res, PlaylistSearchOutcome);
    let items = results.hits.into_iter().map(|h| h.result).collect();
    let total_hits = results.estimated_total_hits.unwrap_or(0);

    Ok(PlaylistSearchOutcome::Results(SearchResults { items, total_hits }))
}

// TODO: replace usages of this and remove this.
fn acl_filter(action: &str, context: &Context) -> Option<Filter> {
    // If the user is admin, we just skip the filter alltogether as the admin
    // can see anything anyway.
    if context.auth.is_admin() {
        return None;
    }

    Some(Filter::acl_access(action, context))
}

enum Filter {
    // TODO: try to avoid Vec if not necessary. Oftentimes there are only two operands.
    And(Vec<Filter>),
    Or(Vec<Filter>),
    Leaf(Cow<'static, str>),

    /// No filter. Formats to empty string and is filtered out if inside the
    /// `And` or `Or` operands.
    None,
}

impl Filter {
    fn make_or_none_for_admins(context: &Context, f: impl FnOnce() -> Self) -> Self {
        if context.auth.is_admin() { Self::None } else { f() }
    }

    fn or(operands: impl IntoIterator<Item = Self>) -> Self {
        Self::Or(operands.into_iter().collect())
    }

    fn and(operands: impl IntoIterator<Item = Self>) -> Self {
        Self::And(operands.into_iter().collect())
    }

    /// Returns the filter "listed = true".
    fn listed() -> Self {
        Self::Leaf("listed = true".into())
    }

    /// Returns a filter checking that the current user has read access and that
    /// the item is listed. If the user has the privilege to find unlisted
    /// item, the second check is not performed.
    fn listed_and_readable(context: &Context) -> Self {
        let readable = Self::acl_access("read_roles", context);
        if context.auth.can_find_unlisted_items(&context.config.auth) {
            readable
        } else {
            Self::and([readable, Self::listed()])
        }
    }

    /// Returns a filter checking if `roles_field` has any overlap with the
    /// current user roles. Encodes all roles as hex to work around Meili's
    /// lack of case-sensitive comparison.
    fn acl_access(roles_field: &str, context: &Context) -> Self {
        use std::io::Write;
        const HEX_DIGITS: &[u8; 16] = b"0123456789abcdef";

        // TODO: this function can be optimized in various places.

        let mut out = Vec::new();
        write!(out, "{roles_field} IN [").unwrap();
        for role in context.auth.roles() {
            for byte in role.bytes() {
                out.extend_from_slice(&[
                    HEX_DIGITS[(byte >> 4) as usize],
                    HEX_DIGITS[(byte & 0xF) as usize],
                ]);
            }
            out.push(b',');
        }
        out.push(b']');

        let out = String::from_utf8(out).unwrap();
        Self::Leaf(out.into())
    }
}

impl fmt::Display for Filter {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        fn join(f: &mut fmt::Formatter, operands: &[Filter], sep: &str) -> fmt::Result {
            if operands.iter().all(|op| matches!(op, Filter::None)) {
                return Ok(());
            }

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
            Self::None => Ok(()),
        }
    }
}

fn hit_to_search_event(
    hit: meilisearch_sdk::SearchResult<search::Event>,
) -> SearchEvent {
    let get_matches = |key: &str| hit.matches_position.as_ref()
        .and_then(|matches| matches.get(key))
        .map(|v| v.as_slice())
        .unwrap_or_default();

    SearchEvent::new(hit.result, get_matches("slide_texts.texts"), get_matches("caption_texts.texts"))
}
