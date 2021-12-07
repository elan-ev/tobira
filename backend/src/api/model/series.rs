use futures::TryStreamExt;
use juniper::graphql_object;
use tokio_postgres::Row;

use crate::{
    api::{Context, err::ApiResult, Id, model::event::Event},
    db::{types::Key, util::dbargs},
};


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

    async fn events(&self, context: &Context) -> ApiResult<Vec<Event>> {
        Event::load_for_series(self.key, context).await
    }
}

impl Series {
    pub(crate) async fn load(context: &Context) -> ApiResult<Vec<Self>> {
        let series = context.db(context.require_moderator()?)
            .query_raw(
                &format!(
                    "select {} from series
                    order by title",
                    Self::COL_NAMES,
                ),
                dbargs![],
            )
            .await?
            .map_ok(Self::from_row)
            .try_collect()
            .await?;

        Ok(series)
    }

    pub(crate) async fn load_by_id(id: Id, context: &Context) -> ApiResult<Option<Self>> {
        if let Some(key) = id.key_for(Id::SERIES_KIND) {
            Self::load_by_key(key, context).await
        } else {
            Ok(None)
        }
    }

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> ApiResult<Option<Series>> {
        let result = context.db
            .query_opt(
                &format!(
                    "select {}
                        from series
                        where id = $1",
                    Self::COL_NAMES,
                ),
                &[&key],
            )
            .await?
            .map(Self::from_row);

        Ok(result)
    }

    const COL_NAMES: &'static str = "id, title, description";

    fn from_row(row: Row) -> Self {
        Self {
            key: row.get(0),
            title: row.get(1),
            description: row.get(2),
        }
    }
}
