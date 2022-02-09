use std::fmt;

use chrono::{DateTime, Utc};
use postgres_types::ToSql;
use serde::{Serialize, Deserialize};
use tokio_postgres::Row;
use juniper::{GraphQLObject, graphql_object};

use crate::{
    api::{
        Context, Cursor, Id, Node, NodeValue,
        err::{self, ApiResult, invalid_input},
        model::series::Series,
    },
    db::types::{EventTrack, Key},
    prelude::*,
    util::lazy_format,
};


#[derive(Debug)]
pub(crate) struct Event {
    key: Key,
    series: Option<Key>,
    opencast_id: String,

    title: String,
    description: Option<String>,
    duration: Option<i32>,
    created: DateTime<Utc>,
    updated: DateTime<Utc>,
    creator: Option<String>,

    thumbnail: Option<String>,
    tracks: Vec<Track>,
    can_write: bool,
}

#[derive(Debug, GraphQLObject)]
struct Track {
    uri: String,
    flavor: String,
    mimetype: Option<String>,
    // TODO: this should be `[i32; 2]` but the relevant patch is not released
    // yet: https://github.com/graphql-rust/juniper/pull/966
    resolution: Option<Vec<i32>>,
}

#[juniper::graphql_interface]
impl Node for Event {
    fn id(&self) -> Id {
        Id::event(self.key)
    }
}

#[graphql_object(Context = Context, impl = NodeValue)]
impl Event {
    fn id(&self) -> Id {
        Node::id(self)
    }
    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }
    fn title(&self) -> &str {
        &self.title
    }
    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
    /// Duration in ms.
    fn duration(&self) -> Option<f64> {
        self.duration.map(Into::into)
    }
    fn thumbnail(&self) -> Option<&str> {
        self.thumbnail.as_deref()
    }
    fn tracks(&self) -> &[Track] {
        &self.tracks
    }
    fn created(&self) -> DateTime<Utc> {
        self.created
    }
    fn updated(&self) -> DateTime<Utc> {
        self.updated
    }
    fn creator(&self) -> &Option<String> {
        &self.creator
    }

    /// Whether the current user has write access to this event.
    fn can_write(&self) -> bool {
        self.can_write
    }

    async fn series(&self, context: &Context) -> ApiResult<Option<Series>> {
        if let Some(series) = self.series {
            Series::load_by_id(Id::series(series), context).await
        } else {
            Ok(None)
        }
    }
}

impl Event {
    pub(crate) async fn load_all(context: &Context) -> ApiResult<Vec<Self>> {
        context.db(context.require_moderator()?)
            .query_mapped(
                &format!(
                    "select {} from events \
                        where read_roles && $1 \
                        order by title",
                    Self::COL_NAMES,
                ),
                dbargs![&context.user.roles()],
                Self::from_row,
            )
            .await?
            .pipe(Ok)
    }

    pub(crate) async fn load_by_id(id: Id, context: &Context) -> ApiResult<Option<Self>> {
        let key = match id.key_for(Id::EVENT_KIND) {
            None => return Ok(None),
            Some(key) => key,
        };

        let query = format!(
            "select {}, $1 && read_roles as can_read from events where id = $2",
            Self::COL_NAMES,
        );
        context.db
            .query_opt(&query, &[&context.user.roles(), &key])
            .await?
            .map(|row| {
                if row.get::<_, bool>("can_read") {
                    Ok(Self::from_row(row))
                } else {
                    Err(err::not_authorized!(
                        key = "view.event",
                        "you cannot view this event",
                    ))
                }
            })
            .transpose()
    }

    pub(crate) async fn load_for_series(
        series_key: Key,
        order: EventSortOrder,
        context: &Context,
    ) -> ApiResult<Vec<Self>> {
        let query = format!(
            "select {} from events where series = $2 and read_roles && $1 {}",
            Self::COL_NAMES,
            order.to_sql(),
        );
        context.db
            .query_mapped(&query, dbargs![&context.user.roles(), &series_key], Self::from_row)
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
        let arg_user_roles = &context.user.roles() as &(dyn ToSql + Sync);
        let mut args = vec![arg_user_roles];

        let col = order.column.to_sql();
        let op_after = if order.direction.is_ascending() { '>' } else { '<' };
        let op_before = if order.direction.is_ascending() { '<' } else { '>' };
        let filter = match (&after, &before) {
            (None, None) => String::new(),
            (Some(after), None) => {
                args.extend_from_slice(&[after.to_sql_arg(&order)?, &after.key]);
                format!("where ({}, id) {} ($2, $3)", col, op_after)
            }
            (None, Some(before)) => {
                args.extend_from_slice(&[before.to_sql_arg(&order)?, &before.key]);
                format!("where ({}, id) {} ($2, $3)", col, op_before)
            }
            (Some(after), Some(before)) => {
                args.extend_from_slice(&[
                    after.to_sql_arg(&order)?,
                    &after.key,
                    before.to_sql_arg(&order)?,
                    &before.key,
                ]);
                format!(
                    "where ({}, id) {} ($2, $3) and ({}, id) {} ($4, $5)",
                    col, op_after, col, op_before,
                )
            },
        };

        // Assemble full query. This query is a bit involved but allows us to
        // retrieve the total count, the absolute offsets of our window and all
        // the event data in one go. The "over(...)" things are window
        // functions.
        let query = format!(
            "select {cols}, row_num, total_count \
                from (\
                    select {cols}, \
                        write_roles, \
                        row_number() over(order by ({sort_col}, id) {sort_order}) as row_num, \
                        count(*) over() as total_count \
                    from events \
                    where write_roles && $1 and read_roles && $1 \
                    order by ({sort_col}, id) {sort_order} \
                ) as tmp \
                {filter} \
                limit {limit}",
            cols = Self::COL_NAMES,
            sort_col = order.column.to_sql(),
            sort_order = sql_sort_order.to_sql(),
            limit = limit,
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
                total_count = Some(row.get::<_, i64>("total_count"));
            }

            // Handle row numbers
            let row_num = row.get::<_, i64>("row_num");
            last_num = Some(row_num);
            if first_num.is_none() {
                first_num = Some(row_num);
            }

            // Retrieve actual event data
            Self::from_row(row)
        }).await?;

        // If total count is `None`, there are no events. We really do want to
        // know the total count, so we do another query.
        let total_count = match total_count {
            Some(c) => c,
            None => {
                let query = "select count(*) \
                    from events \
                    where write_roles && $1 and read_roles && $1";
                context.db
                    .query_one(query, &[&context.user.roles()])
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

    const COL_NAMES: &'static str = "id, series, opencast_id, title, description, \
        duration, created, updated, creator, thumbnail, tracks, write_roles && $1 as can_write";

    fn from_row(row: Row) -> Self {
        Self {
            key: row.get(0),
            series: row.get(1),
            opencast_id: row.get(2),
            title: row.get(3),
            description: row.get(4),
            duration: row.get(5),
            created: row.get(6),
            updated: row.get(7),
            creator: row.get(8),
            thumbnail: row.get(9),
            tracks: row.get::<_, Vec<EventTrack>>(10).into_iter().map(Track::from).collect(),
            can_write: row.get(11),
        }
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
    Duration,
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
            EventSortColumn::Duration => "duration",
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
    items: Vec<Event>,
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
    Duration(i32),
    Created(DateTime<Utc>),
    Updated(DateTime<Utc>),
}

impl EventCursor {
    fn new(event: &Event, order: &EventSortOrder) -> Self {
        let sort_filter = match order.column {
            EventSortColumn::Title => CursorSortFilter::Title(event.title.clone()),
            EventSortColumn::Duration => CursorSortFilter::Duration(
                // TODO: figure out nullable durations
                event.duration.expect("null duration")
            ),
            EventSortColumn::Created => CursorSortFilter::Created(event.created),
            EventSortColumn::Updated => CursorSortFilter::Updated(event.updated),
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
            (CursorSortFilter::Duration(duration), EventSortColumn::Duration) => Ok(duration),
            (CursorSortFilter::Created(created), EventSortColumn::Created) => Ok(created),
            (CursorSortFilter::Updated(updated), EventSortColumn::Updated) => Ok(updated),
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
