use juniper::{graphql_object, GraphQLObject, GraphQLInputObject};
use postgres_types::ToSql;

use crate::{
    api::{
        Context,
        err::ApiResult,
        Id,
        model::{
            realm::{Realm, REALM_JOINS},
            event::{AuthorizedEvent, EventSortOrder}
        },
        Node,
    },
    db::{types::{SeriesState as State, Key}, util::impl_from_db},
    prelude::*,
};


pub(crate) struct Series {
    pub(crate) key: Key,
    opencast_id: String,
    synced_data: Option<SyncedSeriesData>,
}

#[derive(GraphQLObject)]
struct SyncedSeriesData {
    title: String,
    description: Option<String>,
}

impl_from_db!(
    Series,
    select: {
        series.{ id, opencast_id, state, title, description },
    },
    |row| {
        Series {
            key: row.id(),
            opencast_id: row.opencast_id(),
            synced_data: (State::Ready == row.state()).then(
                || SyncedSeriesData {
                    title: row.title(),
                    description: row.description(),
                },
            ),
        }
    },
);

impl Series {
    pub(crate) async fn load_all(context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from series order by title");
        context.db(context.require_moderator()?)
            .query_mapped(&query, dbargs![], |row| Self::from_row_start(&row))
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
        Self::load_by_any_id("id", &key, context).await
    }

    pub(crate) async fn load_by_opencast_id(id: String, context: &Context) -> ApiResult<Option<Self>> {
        Self::load_by_any_id("opencast_id", &id, context).await
    }

    async fn load_by_any_id(
        col: &str,
        id: &(dyn ToSql + Sync),
        context: &Context,
    ) -> ApiResult<Option<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from series where {col} = $1");
        context.db
            .query_opt(&query, &[id])
            .await?
            .map(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }

    pub(crate) async fn load_or_create_by_opencast_id(series: NewSeries, context: &Context) -> ApiResult<Self> {
        let selection = Self::select().with_omitted_table_prefix("series");
        let query = format!(
            "with \
                existing as (select {selection} from series where opencast_id = $1), \
                new as (insert into series (opencast_id, title, state, updated) \
                    select $1, $2, 'waiting', '-infinity' \
                        where not exists (select null from existing) \
                    returning {selection}) \
            select {selection} from existing \
                union all select {selection} from new",
        );
        context.db(context.require_moderator()?)
            .query_one(&query, &[&series.opencast_id, &series.title])
            .await?
            .pipe(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }
}

/// Represents an Opencast series.
#[graphql_object(Context = Context)]
impl Series {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }

    fn synced_data(&self) -> &Option<SyncedSeriesData> {
        &self.synced_data
    }

    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        let selection = Realm::select();
        let query = format!("\
            select {selection} \
            from realms \
            {REALM_JOINS} \
            where exists ( \
                select 1 as contains \
                from blocks \
                where realm = realms.id \
                and type = 'series' \
                and series = $1 \
            ) \
        ");
        let id = self.id().key_for(Id::SERIES_KIND).unwrap();
        context.db.query_mapped(&query, dbargs![&id], |row| Realm::from_row_start(&row))
            .await?
            .pipe(Ok)
    }

    #[graphql(arguments(order(default = Default::default())))]
    async fn events(&self, order: EventSortOrder, context: &Context) -> ApiResult<Vec<AuthorizedEvent>> {
        AuthorizedEvent::load_for_series(self.key, order, context).await
    }
}

impl Node for Series {
    fn id(&self) -> Id {
        Id::series(self.key)
    }
}


#[derive(GraphQLInputObject)]
pub(crate) struct NewSeries {
    opencast_id: String,
    title: String,
    // TODO In the future this `struct` can be extended with additional
    // (potentially optional) fields. For now we only need these.
    // Since `mountSeries` feels even more like a private API
    // in some way, and since passing stuff like metadata isn't trivial either
    // I think it's okay to leave it at that for now.
}
