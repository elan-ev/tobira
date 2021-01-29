use juniper::{graphql_object, FieldResult};

use crate::{Context, id::Key, Id, util::RowExt};


pub(crate) struct Series {
    key: Key,
    title: String,
    description: Option<String>,
}

#[graphql_object]
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

    // TODO Return events
}

impl Series {
    pub(crate) async fn load_by_id(id: Id, context: &Context) -> FieldResult<Option<Self>> {
        let result = if let Some(key) = id.key_for(Id::SERIES_KIND) {
            context.db.get()
                .await?
                .query_opt(
                    "select id, title, description
                        from series
                        where id = $1",
                    &[&(key as i64) as _],
                )
                .await?
                .map(|row| Self {
                    key: row.get_key(0),
                    title: row.get(1),
                    description: row.get(2),
                })
        } else {
            None
        };

        Ok(result)
    }
}
