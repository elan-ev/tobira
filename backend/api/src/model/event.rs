use futures::stream::TryStreamExt;
use tokio_postgres::Row;
use juniper::{graphql_object, FieldResult};

use crate::{Context, Id, id::Key, model::series::Series, util::RowExt};


pub(crate) struct Event {
    key: Key,
    title: String,
    video: String,
    thumbnail: String,
    description: Option<String>,
    duration: u32,
    series: Option<Key>,
}

#[graphql_object(Context = Context)]
impl Event {
    fn id(&self) -> Id {
        Id::event(self.key)
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn video(&self) -> &str {
        &self.video
    }

    fn thumbnail(&self) -> &str {
        &self.thumbnail
    }

    fn duration(&self) -> f64 {
        self.duration.into()
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
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
            context.db
                .query_opt(
                    "select id, title, video, thumbnail, duration, description, series
                        from events
                        where id = $1",
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
        let result = context.db
            .query_raw(
                "select id, title, video, thumbnail, duration, description, series
                    from events
                    where series = $1",
                &[series_key as i64],
            )
            .await?
            .map_ok(Self::from_row)
            .try_collect()
            .await?;

        Ok(result)
    }

    fn from_row(row: Row) -> Self {
        Self {
            key: row.get_key(0),
            title: row.get(1),
            video: row.get(2),
            thumbnail: row.get(3),
            duration: row.get::<_, i32>(4) as u32,
            description: row.get(5),
            series: row.get::<_, Option<i64>>(6).map(|series| series as u64),
        }
    }
}
