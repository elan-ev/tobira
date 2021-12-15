use std::fmt;

use chrono::{DateTime, Utc};
use tokio_postgres::Row;
use juniper::{GraphQLObject, graphql_object};

use crate::{
    api::{Context, err::{self, ApiResult}, Id, model::series::Series},
    db::types::{EventTrack, Key},
    prelude::*,
    util::lazy_format,
};


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

#[derive(GraphQLObject)]
struct Track {
    uri: String,
    flavor: String,
    mimetype: Option<String>,
    // TODO: this should be `[i32; 2]` but the relevant patch is not released
    // yet: https://github.com/graphql-rust/juniper/pull/966
    resolution: Option<Vec<i32>>,
}

#[graphql_object(Context = Context)]
impl Event {
    fn id(&self) -> Id {
        Id::event(self.key)
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
    ) -> ApiResult<Vec<Self>> {
        // TODO: this currently does a sequential scan. With 7000 events, it
        // only takes 10ms or so, but yeah, O(n) aint great.
        let query = format!(
            "select {} from events where write_roles && $1 and read_roles && $1 {}",
            Self::COL_NAMES,
            order.to_sql(),
        );
        context.db
            .query_mapped(&query, dbargs![&context.user.roles()], Self::from_row)
            .await
            .map_err(Into::into)
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

#[derive(Debug, Clone, Copy, juniper::GraphQLEnum)]
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
        let col = match self.column {
            EventSortColumn::Title => "title",
            EventSortColumn::Duration => "duration",
            EventSortColumn::Created => "created",
            EventSortColumn::Updated => "updated",
        };
        let direction = match self.direction {
            SortDirection::Ascending => "asc",
            SortDirection::Descending => "desc",
        };

        lazy_format!("order by {} {}", col, direction)
    }
}
