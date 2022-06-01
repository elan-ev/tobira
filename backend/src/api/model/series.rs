use juniper::{graphql_interface, graphql_object};
use tokio_postgres::Row;

use crate::{
    api::{
        Context,
        err::ApiResult,
        Id,
        model::{
            realm::Realm,
            event::{AuthorizedEvent, EventSortOrder}
        },
        Node,
    },
    db::types::{SeriesState as State, Key},
    prelude::*,
};


/// Represents an Opencast series.
/// These can exist in different states during their lifecycle,
/// represented by different implementations of this interface:
///
/// - `WaitingSeries`: The series was created "out of band" in regards
///     to the usual path of communication between Opencast and Tobira
///     (i.e. the harvesting protocol).
///     Thus, it does not have all its (meta-)data, yet,
///     and is *waiting* to be fully synced.
///     This can currently only happen using the `mount`-API
///     used by the Opencast Admin UI.
/// - `ReadySeries`: The series is fully synced and up to date, as far
///     as Tobira is concerned. All of its mandatory data fields are set,
///     and the optional ones should reflect the state of the Opencast
///     series as of the last harvest.
#[graphql_interface(Context = Context, for = [WaitingSeries, ReadySeries])]
pub(crate) trait Series {
    fn id(&self) -> Id;
    fn opencast_id(&self) -> &str;

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
        context.db.query_mapped(
            &query,
            dbargs![&self.id().key_for(Id::SERIES_KIND)],
            Realm::from_row,
        )
            .await?
            .pipe(Ok)
    }
}

pub(crate) struct SharedData {
    pub(crate) key: Key,
    opencast_id: String,
}

pub(crate) struct WaitingSeries {
    pub(crate) shared: SharedData,
}

impl Series for WaitingSeries {
    fn id(&self) -> Id {
        Id::series(self.shared.key)
    }

    fn opencast_id(&self) -> &str {
        &self.shared.opencast_id
    }
}

/// See `Series`
#[graphql_object(Context = Context, impl = SeriesValue)]
impl WaitingSeries {
    fn id(&self) -> Id {
        Series::id(self)
    }

    fn opencast_id(&self) -> &str {
        Series::opencast_id(self)
    }

    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        Series::host_realms(self, context).await
    }
}

pub(crate) struct ReadySeries {
    pub(crate) shared: SharedData,
    title: String,
    description: Option<String>,
}

impl Series for ReadySeries {
    fn id(&self) -> Id {
        Id::series(self.shared.key)
    }

    fn opencast_id(&self) -> &str {
        &self.shared.opencast_id
    }
}

/// See `Series`
#[graphql_object(Context = Context, impl = SeriesValue)]
impl ReadySeries {
    fn id(&self) -> Id {
        Series::id(self)
    }

    fn opencast_id(&self) -> &str {
        Series::opencast_id(self)
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    #[graphql(arguments(order(default = Default::default())))]
    async fn events(&self, order: EventSortOrder, context: &Context) -> ApiResult<Vec<AuthorizedEvent>> {
        AuthorizedEvent::load_for_series(self.shared.key, order, context).await
    }

    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        Series::host_realms(self, context).await
    }
}

impl<S: Series> Node for S {
    fn id(&self) -> Id {
        Series::id(self)
    }
}

impl SeriesValue {
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

    pub(crate) async fn load_or_create_by_opencast_id(id: String, context: &Context) -> ApiResult<Self> {
        let cols = Self::COL_NAMES;
        let query = format!(
            "with \
                existing as (select {cols} from series where opencast_id = $1), \
                new as (insert into series (opencast_id, state, updated) \
                    select $1, 'waiting', '-infinity' \
                        where not exists (select null from existing) \
                    returning {cols}) \
            select {cols} from existing \
                union all select {cols} from new",
        );
        context.db(context.require_moderator()?)
            .query_one(&query, &[&id])
            .await?
            .pipe(Self::from_row)
            .pipe(Ok)
    }

    const COL_NAMES: &'static str = "id, opencast_id, state, title, description";

    fn from_row(row: Row) -> Self {
        let shared = SharedData {
            key: row.get(0),
            opencast_id: row.get(1),
        };
        let state = row.get::<_, State>(2);
        match state {
            State::Waiting => WaitingSeries { shared }.into(),
            State::Ready => ReadySeries {
                shared,
                title: row.get(3),
                description: row.get(4),
            }.into(),
        }
    }
}
