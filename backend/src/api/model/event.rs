use std::fmt;

use chrono::{DateTime, Utc};
use postgres_types::ToSql;
use serde::{Serialize, Deserialize};
use tokio_postgres::Row;
use juniper::{GraphQLObject, graphql_object};

use crate::{
    api::{
        Context, Cursor, Id, Node, NodeValue,
        common::NotAllowed,
        err::{self, ApiResult, invalid_input},
        model::{series::{SeriesValue, ReadySeries}, realm::{Realm, REALM_JOINS}},
    },
    db::{types::{EventTrack, EventState, Key, ExtraMetadata}, util::{impl_from_db, select}},
    prelude::*,
    util::lazy_format,
};


#[derive(Debug)]
pub(crate) struct AuthorizedEvent {
    key: Key,
    series: Option<Key>,
    opencast_id: String,
    is_live: bool,

    title: String,
    description: Option<String>,
    created: DateTime<Utc>,
    creators: Vec<String>,

    metadata: ExtraMetadata,
    read_roles: Vec<String>,
    write_roles: Vec<String>,

    synced_data: Option<SyncedEventData>,
}

#[derive(Debug, GraphQLObject)]
pub(crate) struct SyncedEventData {
    updated: DateTime<Utc>,
    /// Duration in milliseconds
    duration: i32,
    tracks: Vec<Track>,
    thumbnail: Option<String>,
}

impl_from_db!(
    AuthorizedEvent,
    select: {
        events.{
            id, state, series, opencast_id, is_live,
            title, description, duration, creators, thumbnail, metadata,
            created, updated,
            tracks,
            read_roles, write_roles,
        },
    },
    |row| {
        Self {
            key: row.id(),
            series: row.series(),
            opencast_id: row.opencast_id(),
            is_live: row.is_live(),
            title: row.title(),
            description: row.description(),
            created: row.created(),
            creators: row.creators(),
            metadata: row.metadata(),
            read_roles: row.read_roles::<Vec<String>>(),
            write_roles: row.write_roles::<Vec<String>>(),
            synced_data: match row.state::<EventState>() {
                EventState::Ready => Some(SyncedEventData {
                    updated: row.updated(),
                    duration: row.duration(),
                    thumbnail: row.thumbnail(),
                    tracks: row.tracks::<Vec<EventTrack>>().into_iter().map(Track::from).collect(),
                }),
                EventState::Waiting => None,
            },
        }
    }
);


#[derive(Debug, GraphQLObject)]
pub(crate) struct Track {
    uri: String,
    flavor: String,
    mimetype: Option<String>,
    // TODO: this should be `[i32; 2]` but the relevant patch is not released
    // yet: https://github.com/graphql-rust/juniper/pull/966
    resolution: Option<Vec<i32>>,
}

impl Node for AuthorizedEvent {
    fn id(&self) -> Id {
        Id::event(self.key)
    }
}

#[graphql_object(Context = Context, impl = NodeValue)]
impl AuthorizedEvent {
    fn id(&self) -> Id {
        Node::id(self)
    }
    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }
    fn is_live(&self) -> bool {
        self.is_live
    }
    fn title(&self) -> &str {
        &self.title
    }
    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
    fn created(&self) -> DateTime<Utc> {
        self.created
    }
    fn creators(&self) -> &Vec<String> {
        &self.creators
    }
    fn metadata(&self) -> &ExtraMetadata {
        &self.metadata
    }

    fn synced_data(&self) -> &Option<SyncedEventData> {
        &self.synced_data
    }

    /// Whether the current user has write access to this event.
    fn can_write(&self, context: &Context) -> bool {
        context.auth.overlaps_roles(&self.write_roles)
    }

    async fn series(&self, context: &Context) -> ApiResult<Option<ReadySeries>> {
        if let Some(series) = self.series {
            let series = SeriesValue::load_by_id(Id::series(series), context)
                .await?
                .map(|series| match series {
                    SeriesValue::ReadySeries(series) => series,
                    // We currently assume (and guarantee) that a series that is referenced by an event
                    // is completely synced before that event.
                    SeriesValue::WaitingSeries(_) => unreachable!(),
                });
            Ok(series)
        } else {
            Ok(None)
        }
    }

    /// Returns a list of realms where this event is referenced (via some kind of block).
    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        let selection = Realm::select();
        let query = format!("\
            select {selection} \
            from realms \
            {REALM_JOINS} \
            where exists ( \
                select 1 as contains \
                from blocks \
                where realm_id = realms.id \
                and ( \
                    type = 'video' and video_id = $1 \
                    or type = 'series' and series_id = ( \
                        select series from events where id = $1 \
                    ) \
                ) \
            ) \
        ");
        context.db.query_mapped(&query, dbargs![&self.key], |row| Realm::from_row_start(&row))
            .await?
            .pipe(Ok)
    }
}

#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum Event {
    Event(AuthorizedEvent),
    NotAllowed(NotAllowed),
}

impl Event {
    pub(crate) fn into_result(self) -> ApiResult<AuthorizedEvent> {
        match self {
            Self::Event(e) => Ok(e),
            Self::NotAllowed(_) => Err(err::not_authorized!(
                key = "view.event",
                "you cannot view this event",
            )),
        }
    }
}

impl AuthorizedEvent {
    pub(crate) async fn load_all(context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!(
            "select {selection} from events \
                where (read_roles || 'ROLE_ADMIN'::text) && $1 \
                order by title",
        );
        context.db(context.require_moderator()?)
            .query_mapped(
                &query,
                dbargs![&context.auth.roles_vec()],
                |row| Self::from_row_start(&row),
            )
            .await?
            .pipe(Ok)
    }

    pub(crate) async fn load_by_id(id: Id, context: &Context) -> ApiResult<Option<Event>> {
        let key = match id.key_for(Id::EVENT_KIND) {
            None => return Ok(None),
            Some(key) => key,
        };

        let selection = Self::select();
        let query = format!("select {selection} from events where id = $1");
        context.db
            .query_opt(&query, &[&key])
            .await?
            .map(|row| {
                let event = Self::from_row_start(&row);
                if context.auth.overlaps_roles(&event.read_roles) {
                    Event::Event(event)
                } else {
                    Event::NotAllowed(NotAllowed)
                }
            })
            .pipe(Ok)
    }

    pub(crate) async fn load_for_series(
        series_key: Key,
        order: EventSortOrder,
        context: &Context,
    ) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!(
            "select {selection} from events \
                where series = $2 and (read_roles || 'ROLE_ADMIN'::text) && $1 {}",
            order.to_sql(),
        );
        context.db
            .query_mapped(
                &query,
                dbargs![&context.auth.roles_vec(), &series_key],
                |row| Self::from_row_start(&row),
            )
            .await?
            .pipe(Ok)
    }

    pub(crate) async fn load_writable_for_user(
        context: &Context,
        order: EventSortOrder,
        first: Option<i32>,
        after: Option<Cursor>,
        last: Option<i32>,
        before: Option<Cursor>,
    ) -> ApiResult<EventConnection> {
        const MAX_COUNT: i32 = 100;

        // Argument validation
        let after = after.map(|c| c.deserialize::<EventCursor>()).transpose()?;
        let before = before.map(|c| c.deserialize::<EventCursor>()).transpose()?;
        if first.map_or(false, |first| first <= 0) {
            return Err(invalid_input!("argument 'first' has to be > 0, but is {:?}", first));
        }
        if last.map_or(false, |last| last <= 0) {
            return Err(invalid_input!("argument 'last' has to be > 0, but is {:?}", last));
        }

        // Make sure only one of `first` and `last` is set and figure out the
        // limit and SQL sort order. If `last` is set, we reverse the order in
        // the SQL query in order to use `limit` effectively. We reverse it
        // again in Rust further below.
        let (limit, sql_sort_order) = match (first, last) {
            (Some(first), None) => (first, order.direction),
            (None, Some(last)) => (last, order.direction.reversed()),
            _ => return Err(invalid_input!("exactly one of 'first' and 'last' must be given")),
        };
        let limit = std::cmp::min(limit, MAX_COUNT);


        // Assemble argument list and the "where" part of the query. This
        // depends on `after` and `before`.
        let mut args = vec![];
        let col = order.column.to_sql();
        let op_after = if order.direction.is_ascending() { '>' } else { '<' };
        let op_before = if order.direction.is_ascending() { '<' } else { '>' };
        let filter = match (&after, &before) {
            (None, None) => String::new(),
            (Some(after), None) => {
                args.extend_from_slice(&[after.to_sql_arg(&order)?, &after.key]);
                format!("where ({}, id) {} ($1, $2)", col, op_after)
            }
            (None, Some(before)) => {
                args.extend_from_slice(&[before.to_sql_arg(&order)?, &before.key]);
                format!("where ({}, id) {} ($1, $2)", col, op_before)
            }
            (Some(after), Some(before)) => {
                args.extend_from_slice(&[
                    after.to_sql_arg(&order)?,
                    &after.key,
                    before.to_sql_arg(&order)?,
                    &before.key,
                ]);
                format!(
                    "where ({}, id) {} ($1, $2) and ({}, id) {} ($3, $4)",
                    col, op_after, col, op_before,
                )
            },
        };

        // Assemble full query. This query is a bit involved but allows us to
        // retrieve the total count, the absolute offsets of our window and all
        // the event data in one go. The "over(...)" things are window
        // functions.
        let arg_user_roles = &context.auth.roles_vec() as &(dyn ToSql + Sync);
        let acl_filter = if context.auth.is_admin() {
            String::new()
        } else {
            args.push(arg_user_roles);
            let arg_index = args.len();

            format!("where write_roles && ${arg_index} and read_roles && ${arg_index}")
        };
        let (selection, mapping) = select!(
            event: AuthorizedEvent from
                AuthorizedEvent::select().with_omitted_table_prefix("events"),
            row_num,
            total_count,
        );
        let query = format!(
            "select {selection} \
                from (\
                    select {event_cols}, \
                        row_number() over(order by ({sort_col}, id) {sort_order}) as row_num, \
                        count(*) over() as total_count \
                    from events \
                    {acl_filter} \
                    order by ({sort_col}, id) {sort_order} \
                ) as tmp \
                {filter} \
                limit {limit}",
            event_cols = Self::select().with_omitted_table_prefix("events"),
            sort_col = order.column.to_sql(),
            sort_order = sql_sort_order.to_sql(),
            limit = limit,
            acl_filter = acl_filter,
            filter = filter,
        );

        // `first_num` and `last_num` are 1-based!
        let mut total_count = None;
        let mut first_num = None;
        let mut last_num = None;

        // Execute query
        let mut events = context.db.query_mapped(&query, args, |row: Row| {
            // Retrieve total count once
            if total_count.is_none() {
                total_count = Some(mapping.total_count.of(&row));
            }

            // Handle row numbers
            let row_num = mapping.row_num.of(&row);
            last_num = Some(row_num);
            if first_num.is_none() {
                first_num = Some(row_num);
            }

            // Retrieve actual event data
            Self::from_row(&row, mapping.event)
        }).await?;

        // If total count is `None`, there are no events. We really do want to
        // know the total count, so we do another query.
        let total_count = match total_count {
            Some(c) => c,
            None => {
                let query = format!("select count(*) from events {}", acl_filter);
                context.db
                    .query_one(&query, &[&context.auth.roles_vec()])
                    .await?
                    .get::<_, i64>(0)
            }
        };

        // If `last` was given, we had to query in reverse order to make `limit`
        // work. So now we need to reverse the result here. We also need to
        // adjust the last and first "num".
        if sql_sort_order != order.direction {
            events.reverse();
            let tmp = first_num;
            first_num = last_num.map(|n| total_count - n + 1);
            last_num = tmp.map(|n| total_count - n + 1);
        }

        // Figure out whether there is a next and/or previous page.
        let (has_next_page, has_previous_page) = match Option::zip(first_num, last_num) {
            Some((first, last)) => (last < total_count, first > 1),
            None => {
                // The DB returned 0 events. That means there are either actually 0 writable
                // events for that user, or all of them were filtered by `after` or `before`.
                if total_count == 0 {
                    (false, false)
                } else if after.is_some() {
                    (false, true)
                } else {
                    (true, false)
                }
            }
        };

        let cast_i32 = |x: i64| x.try_into().expect("more then 2^31 events");
        Ok(EventConnection {
            total_count: cast_i32(total_count),
            page_info: EventPageInfo {
                has_next_page,
                has_previous_page,
                start_cursor: events.first().map(|e| Cursor::new(EventCursor::new(e, &order))),
                end_cursor: events.last().map(|e| Cursor::new(EventCursor::new(e, &order))),
                start_index: first_num.map(cast_i32),
                end_index: last_num.map(cast_i32),
            },
            items: events,
        })
    }
}

impl From<EventTrack> for Track {
    fn from(src: EventTrack) -> Self {
        Self {
            uri: src.uri,
            flavor: src.flavor,
            mimetype: src.mimetype,
            resolution: src.resolution.map(Into::into),
        }
    }
}

/// Defines the sort order for events.
#[derive(Debug, Clone, Copy, juniper::GraphQLInputObject)]
pub(crate) struct EventSortOrder {
    column: EventSortColumn,
    direction: SortDirection,
}

#[derive(Debug, Clone, Copy, juniper::GraphQLEnum)]
enum EventSortColumn {
    Title,
    Created,
    Updated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, juniper::GraphQLEnum)]
enum SortDirection {
    Ascending,
    Descending,
}

impl Default for EventSortOrder {
    fn default() -> Self {
        Self {
            column: EventSortColumn::Created,
            direction: SortDirection::Descending,
        }
    }
}

impl EventSortOrder {
    /// Returns an SQL query fragment like `order by foo asc`.
    fn to_sql(&self) -> impl fmt::Display {
        let Self { column, direction } = *self;
        lazy_format!("order by {} {}", column.to_sql(), direction.to_sql())
    }
}

impl EventSortColumn {
    fn to_sql(self) -> &'static str {
        match self {
            EventSortColumn::Title => "title",
            EventSortColumn::Created => "created",
            EventSortColumn::Updated => "updated",
        }
    }
}

impl SortDirection {
    fn to_sql(self) -> &'static str {
        match self {
            SortDirection::Ascending => "asc",
            SortDirection::Descending => "desc",
        }
    }

    fn is_ascending(&self) -> bool {
        matches!(self, Self::Ascending)
    }

    fn reversed(self) -> Self {
        match self {
            SortDirection::Ascending => SortDirection::Descending,
            SortDirection::Descending => SortDirection::Ascending,
        }
    }
}


#[derive(Debug, juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct EventConnection {
    page_info: EventPageInfo,
    items: Vec<AuthorizedEvent>,
    total_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct EventCursor {
    key: Key,
    sort_filter: CursorSortFilter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum CursorSortFilter {
    Title(String),
    Duration(Option<i32>),
    Created(DateTime<Utc>),
    Updated(Option<DateTime<Utc>>),
}

impl EventCursor {
    fn new(event: &AuthorizedEvent, order: &EventSortOrder) -> Self {
        let sort_filter = match order.column {
            EventSortColumn::Title => CursorSortFilter::Title(event.title.clone()),
            EventSortColumn::Created => CursorSortFilter::Created(event.created),
            EventSortColumn::Updated => CursorSortFilter::Updated(
                event.synced_data.as_ref().map(|s| s.updated)
            ),
        };

        Self {
            sort_filter,
            key: event.key,
        }
    }

    /// Returns the actual filter value as trait object if `self.sort_filter`
    /// matches `order.column` (both about the same column). Returns an error
    /// otherwise.
    fn to_sql_arg(&self, order: &EventSortOrder) -> ApiResult<&(dyn ToSql + Sync + '_)> {
        match (&self.sort_filter, order.column) {
            (CursorSortFilter::Title(title), EventSortColumn::Title) => Ok(title),
            (CursorSortFilter::Created(created), EventSortColumn::Created) => Ok(created),
            (CursorSortFilter::Updated(updated), EventSortColumn::Updated) => {
                match updated {
                    Some(updated) => Ok(updated),
                    None => Ok(&postgres_types::Timestamp::<DateTime<Utc>>::NegInfinity),
                }
            },
            _ => Err(invalid_input!("sort order does not match 'before'/'after' argument")),
        }
    }
}

// TODO: when we add more `PageInfo` structs it might make sense to extract the
// common fields somehow.
#[derive(Debug, Clone, juniper::GraphQLObject)]
pub(crate) struct EventPageInfo {
    pub(crate) has_next_page: bool,
    pub(crate) has_previous_page: bool,

    // TODO: the spec says these shouldn't be optional, but that makes no sense.
    // See: https://stackoverflow.com/q/70448483/2408867
    pub(crate) start_cursor: Option<Cursor>,
    pub(crate) end_cursor: Option<Cursor>,

    /// The index of the first returned event.
    pub(crate) start_index: Option<i32>,
    /// The index of the last returned event.
    pub(crate) end_index: Option<i32>,
}
