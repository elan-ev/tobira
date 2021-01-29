use juniper::{graphql_object, FieldResult};

use crate::{Context, id::Key, Id, model::event::Event, util::RowExt};


pub(crate) struct Series {
    key: Key,
    title: String,
    description: Option<String>,
}

#[graphql_object(Context = Context)]
impl Series {
    fn id(&self) -> Id {
        Id::series(self.key)
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    async fn events(&self, context: &Context) -> FieldResult<Vec<Event>> {
        Event::load_for_series(self.key, context).await
    }
}

impl Series {
    pub(crate) async fn load_by_id(id: Id, context: &Context) -> FieldResult<Option<Self>> {
        if let Some(key) = id.key_for(Id::SERIES_KIND) {
            Self::load_by_key(key, context).await
        } else {
            Ok(None)
        }
    }

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> FieldResult<Option<Series>> {
        let result = context.db.get()
            .await?
            .query_opt(
                "select id, title, description
                    from series
                    where id = $1",
                &[&(key as i64)],
            )
            .await?
            .map(|row| Self {
                key: row.get_key(0),
                title: row.get(1),
                description: row.get(2),
            });

        Ok(result)
    }
}
