use juniper::graphql_object;
use tokio_postgres::Row;

use crate::{
    api::{
        Context,
        err::ApiResult,
        Id,
        model::{
            realm::Realm,
            event::{Event, EventSortOrder}
        },
        Node,
        NodeValue,
    },
    db::{types::Key},
    prelude::*,
};


pub(crate) struct Series {
    pub(crate) key: Key,
    opencast_id: String,
    title: String,
    description: Option<String>,
}

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

    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }

    #[graphql(arguments(order(default = Default::default())))]
    async fn events(&self, order: EventSortOrder, context: &Context) -> ApiResult<Vec<Event>> {
        Event::load_for_series(self.key, order, context).await
    }

    /// Returns a list of realms where this series is referenced (via some kind of block).
    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        let cols = Realm::col_names("realms");
        let query = format!("\
            select {cols} \
            from realms \
            inner join blocks \
                on realms.id = blocks.realm_id and
                type = 'series' and blocks.series_id = $1 \
        ");
        context.db.query_mapped(&query, dbargs![&self.key], Realm::from_row)
            .await?
            .pipe(Ok)
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

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> ApiResult<Option<Self>> {
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

    pub(crate) async fn load_by_opencast_id(id: String, context: &Context) -> ApiResult<Option<Self>> {
        let query = format!("select {} from series where opencast_id = $1", Self::COL_NAMES);
        context.db
            .query_opt(&query, &[&id])
            .await?
            .map(Self::from_row)
            .pipe(Ok)
    }

    const COL_NAMES: &'static str = "id, opencast_id, title, description";

    fn from_row(row: Row) -> Self {
        Self {
            key: row.get(0),
            opencast_id: row.get(1),
            title: row.get(2),
            description: row.get(3),
        }
    }
}
