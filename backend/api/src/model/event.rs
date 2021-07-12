use chrono::{DateTime, Utc};
use futures::stream::TryStreamExt;
use tokio_postgres::Row;
use juniper::{GraphQLObject, graphql_object, FieldResult};

use crate::{Context, Id, db::EventTrack, id::Key, model::series::Series, util::RowExt};


pub(crate) struct Event {
    key: Key,
    series: Option<Key>,

    title: String,
    description: Option<String>,
    duration: Option<i32>,
    created: DateTime<Utc>,
    updated: DateTime<Utc>,
    creator: Option<String>,

    thumbnail: String,
    tracks: Vec<Track>,
}

#[derive(GraphQLObject)]
struct Track {
    uri: String,
    flavor: String,
    mimetype: Option<String>,
    resolution: Option<Vec<i32>>,
}

#[graphql_object(Context = Context)]
impl Event {
    fn id(&self) -> Id {
        Id::event(self.key)
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
    fn thumbnail(&self) -> &str {
        &self.thumbnail
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

    async fn series(&self, context: &Context) -> FieldResult<Option<Series>> {
        if let Some(series) = self.series {
            Series::load_by_id(Id::series(series), context).await
        } else {
            Ok(None)
        }
    }
}

impl Event {
    pub(crate) async fn load_by_id(id: Id, context: &Context) -> FieldResult<Option<Self>> {
        let result = if let Some(key) = id.key_for(Id::EVENT_KIND) {
            context.db.get()
                .await?
                .query_opt(
                    &*format!("select {} from events where id = $1", Self::COL_NAMES),
                    &[&(key as i64)],
                )
                .await?
                .map(Self::from_row)
        } else {
            None
        };

        Ok(result)
    }

    pub(crate) async fn load_for_series(series_key: Key, context: &Context) -> FieldResult<Vec<Self>> {
        let result = context.db.get()
            .await?
            .query_raw(
                &*format!("select {} from events where series = $1", Self::COL_NAMES),
                &[series_key as i64],
            )
            .await?
            .map_ok(Self::from_row)
            .try_collect()
            .await?;

        Ok(result)
    }

    const COL_NAMES: &'static str
        = "id, series, title, description, duration, created, updated, creator, thumbnail, tracks";

    fn from_row(row: Row) -> Self {
        Self {
            key: row.get_key(0),
            series: row.get::<_, Option<i64>>(1).map(|series| series as u64),
            title: row.get(2),
            description: row.get(3),
            duration: row.get(4),
            created: row.get(5),
            updated: row.get(6),
            creator: row.get(7),
            thumbnail: row.get(8),
            tracks: row.get::<_, Vec<EventTrack>>(9).into_iter().map(Track::from).collect(),
        }
    }
}

impl From<EventTrack> for Track {
    fn from(src: EventTrack) -> Self {
        Self {
            uri: src.uri,
            flavor: src.flavor,
            mimetype: src.mimetype,
            resolution: src.resolution,
        }
    }
}
