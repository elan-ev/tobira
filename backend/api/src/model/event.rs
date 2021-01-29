use futures::stream::TryStreamExt;
use juniper::{graphql_object, FieldResult};

use crate::{Context, Id, id::Key, util::RowExt};


pub(crate) struct Event {
    key: Key,
    title: String,
    video: String,
    description: Option<String>,
}

#[graphql_object]
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

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    // TODO Grant access to the event's series
}

impl Event {
    pub(crate) async fn load_by_id(id: Id, context: &Context) -> FieldResult<Option<Self>> {
        let result = if let Some(key) = id.key_for(Id::EVENT_KIND) {
            context.db.get()
                .await?
                .query_opt(
                    "select id, title, video, description
                        from events
                        where id = $1",
                    &[&(key as i64)],
                )
                .await?
                .map(|row| Self {
                    key: row.get_key(0),
                    title: row.get(1),
                    video: row.get(2),
                    description: row.get(3),
                })
        } else {
            None
        };

        Ok(result)
    }

    pub(crate) async fn load_for_series(series_key: Key, context: &Context) -> FieldResult<Vec<Self>> {
        let result = context.db.get()
            .await?
            .query_raw(
                "select id, title, video, description
                        from events
                        where series = $1",
                &[series_key as i64],
            )
            .await?
            .map_ok(|row| Self {
                key: row.get_key(0),
                title: row.get(1),
                video: row.get(2),
                description: row.get(3),
            })
            .try_collect()
            .await?;

        Ok(result)
    }
}
