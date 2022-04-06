use juniper::graphql_object;
use tokio_postgres::Row;

use crate::{
    api::{Context, err::ApiResult, Id, model::event::{Event, EventSortOrder}, Node, NodeValue},
    db::{types::Key},
    prelude::*,
};


pub(crate) struct Series {
    key: Key,
    title: String,
    description: Option<String>,
}

#[juniper::graphql_interface]
impl Node for Series {
    fn id(&self) -> Id {
        Id::series(self.key)
    }
}

#[graphql_object(Context = Context, impl = NodeValue)]
impl Series {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    #[graphql(arguments(order(default = Default::default())))]
    async fn events(&self, order: EventSortOrder, context: &Context) -> ApiResult<Vec<Event>> {
        Event::load_for_series(self.key, order, context).await
    }
}

impl Series {
    pub(crate) async fn load_all(context: &Context) -> ApiResult<Vec<Self>> {
        context.db(context.require_moderator()?)
            .query_mapped(
                &format!(
                    "select {} from series \
                        order by title",
                    Self::COL_NAMES,
                ),
                dbargs![],
                Self::from_row,
            )
            .await?
            .pipe(Ok)
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
                    "select {} \
                        from series \
                        where id = $1",
                    Self::COL_NAMES,
                ),
                &[&key],
            )
            .await?
            .map(Self::from_row);

        Ok(result)
    }

    pub(crate) async fn load_by_opencast_id(id: String, context: &Context) -> ApiResult<Option<Series>> {
        let query = format!("select {} from series where opencast_id = $1", Self::COL_NAMES);
        context.db
            .query_opt(&query, &[&id])
            .await?
            .map(Self::from_row)
            .pipe(Ok)
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
