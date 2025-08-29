use chrono::{DateTime, Utc};
use juniper::{GraphQLScalar, InputValue, ScalarValue};
use meilisearch_sdk::search::{FederationOptions, MatchRange, QueryFederationOptions};
use once_cell::sync::Lazy;
use regex::Regex;
use std::{borrow::Cow, collections::HashMap, fmt, time::Instant};

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

pub(crate) use self::{
    event::{SearchEvent, TextMatch},
    realm::SearchRealm,
    series::SearchSeries,
};


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
    pub(crate) duration: i32,
}

macro_rules! make_search_results_object {
    ($name:literal, $ty:ty) => {
        #[juniper::graphql_object(Context = Context, name = $name)]
        impl SearchResults<$ty> {
            fn items(&self) -> &[$ty] {
                &self.items
            }
            fn total_hits(&self) -> i32 {
                self.total_hits as i32
            }
            /// How long searching took in ms.
            fn duration(&self) -> i32 {
                self.duration
            }
        }
    };
}

make_search_results_object!("SearchResults", NodeValue);
make_search_results_object!("EventSearchResults", SearchEvent);
make_search_results_object!("SeriesSearchResults", SearchSeries);
make_search_results_object!("PlaylistSearchResults", search::Playlist);

/// A byte range, encoded as two hex numbers separated by `-`.
#[derive(Debug, Clone, Copy, GraphQLScalar)]
#[graphql(parse_token(String))]
pub struct ByteSpan {
    pub start: u32,
    pub len: u32,
}

impl ByteSpan {
    fn to_output<S: ScalarValue>(&self) -> juniper::Value<S> {
        juniper::Value::scalar(format!("{:x}-{:x}", self.start, self.len))
    }

    fn from_input<S: ScalarValue>(_input: &InputValue<S>) -> Result<Self, String> {
        unimplemented!("not used right now")
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
            | Err(e @ MsError::HttpError(_))
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
    let elapsed_time = measure_search_duration();
    if user_query.is_empty() {
        return Ok(SearchOutcome::EmptyQuery(EmptyQuery));
    }

    // Search for opencastId if applicable
    let uuid_query = user_query.trim();
    if looks_like_opencast_uuid(&uuid_query) {
        let selection = search::Event::select();
        let query = format!("select {selection} from search_events \
            where id = (select id from events where opencast_id = $1) \
            and (preview_roles || read_roles || 'ROLE_ADMIN'::text) && $2");
        let items: Vec<NodeValue> = context.db
            .query_opt(&query, &[&uuid_query, &context.auth.roles_vec()])
            .await?
            .map(|row| {
                let e = search::Event::from_row_start(&row);
                SearchEvent::without_matches(e, &context).into()
            })
            .into_iter()
            .collect();
        let total_hits = items.len();
        return Ok(SearchOutcome::Results(SearchResults {
            items,
            total_hits,
            duration: elapsed_time(),
        }));
    }


    // Prepare the event search
    let filter = Filter::and([
        Filter::listed(),
        Filter::preview_or_read_access(context),
        // Filter out live events that already ended
        Filter::or([
            Filter::Leaf("is_live = false ".into()),
            Filter::Leaf(format!("end_time_timestamp >= {}", Utc::now().timestamp()).into()),
        ]),
        // Apply user selected date filters
        filters.start
            .map(|start| Filter::Leaf(format!("created_timestamp >= {}", start.timestamp()).into()))
            .unwrap_or(Filter::True),
        filters.end
            .map(|end| Filter::Leaf(format!("created_timestamp <= {}", end.timestamp()).into()))
            .unwrap_or(Filter::True),
    ]).to_string();
    let event_query = context.search.event_index.search()
        .with_query(user_query)
        .with_show_matches_position(true)
        .with_filter(&filter)
        .build();

    // Prepare the series search
    let series_query = context.search.series_index.search()
        .with_query(user_query)
        .with_show_matches_position(true)
        .with_filter("listed = true")
        .with_federation_options(QueryFederationOptions {
            weight: Some(1.1),
        })
        .build();

    // Prepare the realm search
    let realm_query = context.search.realm_index.search()
        .with_query(user_query)
        .with_filter("is_user_realm = false")
        .with_show_matches_position(true)
        .build();

    let mut multi_search = context.search.client.multi_search();
    if matches!(filters.item_type, None | Some(ItemType::Event)) {
        multi_search.with_search_query(event_query);
    }
    if matches!(filters.item_type, None | Some(ItemType::Series)) {
        multi_search.with_search_query(series_query);
    }
    if matches!(filters.item_type, None | Some(ItemType::Realm)) {
        multi_search.with_search_query(realm_query);
    }
    let multi_search = multi_search.with_federation(FederationOptions {
        limit: Some(30),
        offset: Some(0), // TODO: pagination
        ..Default::default()
    });


    #[derive(serde::Deserialize)]
    #[serde(untagged)]
    enum MultiSearchItem {
        Event(search::Event),
        Series(search::Series),
        Realm(search::Realm),
    }

    // TODO: Check if sort order makes sense. That's because comparing scores of
    // different indices is not well defined right now. We can either use score
    // details or adding dummy searchable fields to the realm index. See this
    // discussion for more info:
    // https://github.com/orgs/meilisearch/discussions/489#discussioncomment-6160361
    let res = handle_search_result!(multi_search.execute::<MultiSearchItem>().await, SearchOutcome);

    let items = res.hits.into_iter()
        .map(|res| {
            let mp = res.matches_position.as_ref();
            match res.result {
                MultiSearchItem::Event(event) => NodeValue::from(SearchEvent::new(event, mp, &context)),
                MultiSearchItem::Series(series) => NodeValue::from(SearchSeries::new(series, mp, context)),
                MultiSearchItem::Realm(realm) => NodeValue::from(SearchRealm::new(realm, mp)),
            }
        })
        .collect();
    Ok(SearchOutcome::Results(SearchResults {
        items,
        total_hits: res.estimated_total_hits,
        duration: elapsed_time(),
    }))
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
    exclude_series_members: bool,
    excluded_ids: &[String],
    context: &Context,
) -> ApiResult<EventSearchOutcome> {
    let elapsed_time = measure_search_duration();
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    let mut filter = Filter::make_or_true_for_admins(context, || {
        // All users can always find all events they have write access to. If
        // `writable_only` is false, this API also returns events that are
        // listed and that the user can read.
        let writable = Filter::write_access(context);
        if writable_only {
            writable
        } else {
            Filter::or([
                Filter::preview_or_read_access(context).and_listed(context),
                writable,
            ])
        }
    });

    if exclude_series_members {
        filter = Filter::and([
            filter,
            Filter::Leaf("series_id IS NULL".into()),
        ]);
    }

    if !excluded_ids.is_empty() {
        filter = Filter::and([
            filter,
            Filter::Leaf(format!("id NOT IN [{}]",
                excluded_ids.iter()
                    .map(|id| format!("\"{}\"", id))
                    .collect::<Vec<_>>()
                    .join(", ")
            ).into()),
        ]);
    }

    let filter = filter.to_string();

    let mut query = context.search.event_index.search();
    query.with_query(user_query);
    query.with_limit(50);
    query.with_show_matches_position(true);
    // We don't want to search through, nor retrieve the event texts.
    query.with_attributes_to_search_on(&["title", "creators", "series_title"]);
    query.with_filter(&filter);
    if user_query.is_empty() {
        query.with_sort(&["updated_timestamp:desc"]);
    }
    let res = query.execute::<search::Event>().await;
    let results = handle_search_result!(res, EventSearchOutcome);
    let items = results.hits.into_iter()
        .map(|h| SearchEvent::new(h.result, h.matches_position.as_ref(), &context))
        .collect();
    let total_hits = results.estimated_total_hits.unwrap_or(0);

    Ok(EventSearchOutcome::Results(SearchResults { items, total_hits, duration: elapsed_time() }))
}

// See `EventSearchOutcome` for additional information.
#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum SeriesSearchOutcome {
    SearchUnavailable(SearchUnavailable),
    Results(SearchResults<SearchSeries>),
}

pub(crate) async fn all_series(
    user_query: &str,
    writable_only: bool,
    context: &Context,
) -> ApiResult<SeriesSearchOutcome> {
    let elapsed_time = measure_search_duration();
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    let filter = Filter::make_or_true_for_admins(context, || {
        let writable = Filter::write_access(context);

        // All users can always find all items they have write access to,
        // regardless whether they are listed or not.
        if writable_only {
            return writable;
        }

        // Since series read_roles are not used for access control, we only need
        // to check whether we can return unlisted videos.
        if context.auth.can_find_unlisted_items(&context.config.auth) {
            Filter::True
        } else {
            Filter::or([writable, Filter::listed()])
        }
    }).to_string();

    let mut query = context.search.series_index.search();
    query.with_query(user_query);
    query.with_show_matches_position(true);
    query.with_filter(&filter);
    query.with_limit(50);
    query.with_sort(&["created_timestamp:desc"]);
    let res = query.execute::<search::Series>().await;
    let results = handle_search_result!(res, SeriesSearchOutcome);
    let items = results.hits.into_iter()
        .map(|h| SearchSeries::new(h.result, h.matches_position.as_ref(), context))
        .collect();
    let total_hits = results.estimated_total_hits.unwrap_or(0);

    Ok(SeriesSearchOutcome::Results(SearchResults { items, total_hits, duration: elapsed_time() }))
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
    let elapsed_time = measure_search_duration();
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    let filter = Filter::make_or_true_for_admins(context, || {
        // All users can always find all playlists they have write access to. If
        // `writable_only` is false, this API also returns playlists that are
        // listed and that the user can read.
        let writable = Filter::write_access(context);
        if writable_only {
            writable
        } else {
            Filter::or([
                Filter::read_access(context).and_listed(context),
                writable,
            ])
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

    Ok(PlaylistSearchOutcome::Results(SearchResults { items, total_hits, duration: elapsed_time() }))
}


enum Filter {
    // TODO: try to avoid Vec if not necessary. Oftentimes there are only two operands.

    /// Must not contain `Filter::None`, which is handled by `Filter::and`.
    And(Vec<Filter>),

    /// Must not contain `Filter::None`, which is handled by `Filter::or`.
    Or(Vec<Filter>),
    Leaf(Cow<'static, str>),

    /// A constant `true`. Inside `Or`, results in the whole `Or` expression
    /// being replaced by `True`. Inside `And`, this is just filtered out and
    /// the remaining operands are evaluated. If formatted on its own, empty
    /// string is emitted.
    True,
}

impl Filter {
    fn make_or_true_for_admins(context: &Context, f: impl FnOnce() -> Self) -> Self {
        if context.auth.is_admin(&context.config.auth) { Self::True } else { f() }
    }

    fn or(operands: impl IntoIterator<Item = Self>) -> Self {
        let mut v = Vec::new();
        for op in operands {
            if matches!(op, Self::True) {
                return Self::True;
            }
            v.push(op);
        }
        Self::Or(v)
    }

    fn and(operands: impl IntoIterator<Item = Self>) -> Self {
        Self::And(
            operands.into_iter()
                .filter(|op| !matches!(op, Self::True))
                .collect(),
        )
    }

    /// Returns the filter "listed = true".
    fn listed() -> Self {
        Self::Leaf("listed = true".into())
    }

    /// If the user can find unlisted items, just returns `self`. Otherwise,
    /// `self` is ANDed with `Self::listed()`.
    fn and_listed(self, context: &Context) -> Self {
        if context.auth.can_find_unlisted_items(&context.config.auth) {
            self
        } else {
            Self::and([self, Self::listed()])
        }
    }

    fn read_access(context: &Context) -> Self {
        Self::make_or_true_for_admins(context, || Self::acl_access_raw("read_roles", context))
    }

    fn write_access(context: &Context) -> Self {
        Self::make_or_true_for_admins(context, || Self::acl_access_raw("write_roles", context))
    }

    fn preview_or_read_access(context: &Context) -> Self {
        Self::make_or_true_for_admins(context, || Self::or([
            Self::acl_access_raw("read_roles", context),
            Self::acl_access_raw("preview_roles", context),
        ]))
    }

    /// Returns a filter checking if `roles_field` has any overlap with the
    /// current user roles. Encodes all roles as hex to work around Meili's
    /// lack of case-sensitive comparison. Does not handle the ROLE_ADMIN case.
    fn acl_access_raw(roles_field: &str, context: &Context) -> Self {
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
            // We are guaranteed by `and` and `or` methods that there are no
            // `Self::True`s in here.
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
            Self::True => Ok(()),
        }
    }
}


fn match_ranges_for<'a>(
    match_positions: Option<&'a HashMap<String, Vec<MatchRange>>>,
    field: &str,
) -> &'a [MatchRange] {
    match_positions
        .and_then(|m| m.get(field))
        .map(|v| v.as_slice())
        .unwrap_or_default()
}

fn field_matches_for(
    match_positions: Option<&HashMap<String, Vec<MatchRange>>>,
    field: &str,
) -> Vec<ByteSpan> {
    match_ranges_for(match_positions, field).iter()
        .map(|m| ByteSpan { start: m.start as u32, len: m.length as u32 })
        .take(8) // The frontend can only show a limited number anyway
        .collect()
}

pub(crate) fn measure_search_duration() -> impl FnOnce() -> i32 {
    let start = Instant::now();
    move || start.elapsed().as_millis() as i32
}
