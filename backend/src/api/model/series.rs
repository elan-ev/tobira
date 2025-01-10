use chrono::{DateTime, Utc};
use juniper::{graphql_object, GraphQLObject, GraphQLInputObject};
use postgres_types::ToSql;

use crate::{
    api::{
        Context, Id, Node, NodeValue,
        err::{invalid_input, ApiResult},
        model::{
            event::AuthorizedEvent,
            realm::Realm,
            acl::{self, Acl},
        },
    },
    db::{
        types::SeriesState as State,
        util::{impl_from_db, select},
    },
    model::{Key, ExtraMetadata},
    prelude::*,
};

use super::{
    block::{BlockValue, NewSeriesBlock, VideoListLayout, VideoListOrder},
    playlist::VideoListEntry,
    realm::{NewRealm, RealmSpecifier, RemoveMountedSeriesOutcome, UpdatedRealmName},
    shared::{load_writable_for_user, AssetMapping, Connection, LoadableAsset, PageInfo, SeriesSortColumn, SortOrder},
};


pub(crate) struct Series {
    pub(crate) key: Key,
    pub(crate) opencast_id: String,
    pub(crate) synced_data: Option<SyncedSeriesData>,
    pub(crate) title: String,
    pub(crate) created: Option<DateTime<Utc>>,
    pub(crate) metadata: Option<ExtraMetadata>,
    pub(crate) read_roles: Option<Vec<String>>,
    pub(crate) write_roles: Option<Vec<String>>,
}

#[derive(GraphQLObject)]
pub(crate) struct SyncedSeriesData {
    description: Option<String>,
}

impl_from_db!(
    Series,
    select: {
        series.{
            id, opencast_id, state,
            title, description, created,
            metadata, read_roles, write_roles,
        },
    },
    |row| {
        Series {
            key: row.id(),
            opencast_id: row.opencast_id(),
            title: row.title(),
            created: row.created(),
            metadata: row.metadata(),
            read_roles: row.read_roles(),
            write_roles: row.write_roles(),
            synced_data: (State::Ready == row.state()).then(
                || SyncedSeriesData {
                    description: row.description(),
                },
            ),
        }
    },
);

impl Series {
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

    async fn load_acl(&self, context: &Context) -> ApiResult<Option<Acl>> {
        match (self.read_roles.as_ref(), self.write_roles.as_ref()) {
            (None, None) => Ok(None),
            (read_roles, write_roles) => {
                let raw_roles_sql = "\
                    select unnest($1::text[]) as role, 'read' as action
                    union
                    select unnest($2::text[]) as role, 'write' as action
                ";

                acl::load_for(context, raw_roles_sql, dbargs![&read_roles, &write_roles])
                    .await
                    .map(Some)
            }
        }
    }

    pub(crate) async fn create(series: NewSeries, context: &Context) -> ApiResult<Self> {
        let selection = Self::select();
        let query = format!(
            "insert into series (opencast_id, title, state, updated) \
                values ($1, $2, 'waiting', '-infinity') \
                returning {selection}",
        );
        context.db(context.require_tobira_admin()?)
            .query_one(&query, &[&series.opencast_id, &series.title])
            .await?
            .pipe(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }

    pub(crate) async fn announce(series: NewSeries, context: &Context) -> ApiResult<Self> {
        context.auth.required_trusted_external()?;
        Self::create(series, context).await
    }

    pub(crate) async fn add_mount_point(
        series_oc_id: String,
        target_path: String,
        context: &Context,
    ) -> ApiResult<Realm> {
        context.auth.required_trusted_external()?;

        let series = Self::load_by_opencast_id(series_oc_id, context)
            .await?
            .ok_or_else(|| invalid_input!("`seriesId` does not refer to a valid series"))?;

        let target_realm = Realm::load_by_path(target_path, context)
            .await?
            .ok_or_else(|| invalid_input!("`targetPath` does not refer to a valid realm"))?;

        let blocks = BlockValue::load_for_realm(target_realm.key, context).await?;
        if !blocks.is_empty() {
            return Err(invalid_input!("series can only be mounted in empty realms"));
        }

        BlockValue::add_series(
            Id::realm(target_realm.key),
            0,
            NewSeriesBlock {
                series: series.id(),
                show_title: false,
                show_metadata: true,
                order: VideoListOrder::NewToOld,
                layout: VideoListLayout::Gallery,
            },
            context,
        ).await?;

        let block = &BlockValue::load_for_realm(target_realm.key, context).await?[0];

        Realm::rename(
            target_realm.id(),
            UpdatedRealmName::from_block(block.id()),
            context,
        ).await
    }

    pub(crate) async fn remove_mount_point(
        series_oc_id: String,
        path: String,
        context: &Context,
    ) -> ApiResult<RemoveMountedSeriesOutcome> {
        context.auth.required_trusted_external()?;

        let series = Self::load_by_opencast_id(series_oc_id, context)
            .await?
            .ok_or_else(|| invalid_input!("`seriesId` does not refer to a valid series"))?;

        let old_realm = Realm::load_by_path(path, context)
            .await?
            .ok_or_else(|| invalid_input!("`path` does not refer to a valid realm"))?;

        let blocks = BlockValue::load_for_realm(old_realm.key, context).await?;

        if blocks.len() != 1 {
            return Err(invalid_input!("series can only be removed if it is the realm's only block"));
        }

        if !matches!(&blocks[0], BlockValue::SeriesBlock(b) if b.series == Some(series.id())) {
            return Err(invalid_input!("the series is not mounted on the specified realm"));
        }

        if old_realm.children(context).await?.len() == 0 {
            // The realm has no children, so it can be removed.
            let removed_realm = Realm::remove(old_realm.id(), context).await?;

            return Ok(RemoveMountedSeriesOutcome::RemovedRealm(removed_realm));
        }

        if old_realm.name_from_block.map(Id::block) == Some(blocks[0].id()) {
            // The realm has its name derived from the series block that is being removed - so the name
            // shouldn't be used anymore. Ideally this would restore the previous title,
            // but that isn't stored anywhere. Instead the realm is given the name of its path segment.
            Realm::rename(
                old_realm.id(),
                UpdatedRealmName::plain(old_realm.path_segment),
                context,
            ).await?;
        }

        let removed_block = BlockValue::remove(blocks[0].id(), context).await?;

        Ok(RemoveMountedSeriesOutcome::RemovedBlock(removed_block))
    }

    pub(crate) async fn mount(
        series: NewSeries,
        parent_realm_path: String,
        new_realms: Vec<RealmSpecifier>,
        context: &Context,
    ) -> ApiResult<Realm> {
        context.auth.required_trusted_external()?;

        // Check parameters
        if new_realms.iter().rev().skip(1).any(|r| r.name.is_none()) {
            return Err(invalid_input!("all new realms except the last need to have a name"));
        }

        let parent_realm = Realm::load_by_path(parent_realm_path, context)
            .await?
            .ok_or_else(|| invalid_input!("`parentRealmPath` does not refer to a valid realm"))?;

        if new_realms.is_empty() {
            let blocks = BlockValue::load_for_realm(parent_realm.key, context).await?;
            if !blocks.is_empty() {
                return Err(invalid_input!("series can only be mounted in empty realms"));
            }
        }

        // Create series
        let series = Series::create(series, context).await?;

        // Create realms
        let target_realm = {
            let mut target_realm = parent_realm;
            for RealmSpecifier { name, path_segment } in new_realms {
                target_realm = Realm::add(NewRealm {
                    // The `unwrap_or` case is only potentially used for the
                    // last realm, which is renamed below anyway. See the check
                    // above.
                    name: name.unwrap_or_else(|| "temporary-dummy-name".into()),
                    path_segment,
                    parent: Id::realm(target_realm.key),
                }, context).await?
            }
            target_realm
        };

        // Create mount point
        Self::add_mount_point(series.opencast_id, target_realm.full_path, context).await
    }

    pub(crate) async fn load_writable_for_user(
        context: &Context,
        order: SortOrder<SeriesSortColumn>,
        offset: i32,
        limit: i32,
    ) -> ApiResult<SeriesConnection> {
        let conn = load_writable_for_user::<Series, SeriesSortColumn>(
            context, order, offset, limit,
        ).await?;

        Ok(SeriesConnection { inner: conn })
    }
}

/// Represents an Opencast series.
#[graphql_object(Context = Context, impl = NodeValue)]
impl Series {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn created(&self) -> &Option<DateTime<Utc>> {
        &self.created
    }

    fn metadata(&self) -> &Option<ExtraMetadata> {
        &self.metadata
    }

    fn synced_data(&self) -> &Option<SyncedSeriesData> {
        &self.synced_data
    }

    async fn acl(&self, context: &Context) -> ApiResult<Option<Acl>> {
        self.load_acl(context).await
    }

    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        let selection = Realm::select();
        let query = format!("\
            select {selection} \
            from realms \
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

    async fn entries(&self, context: &Context) -> ApiResult<Vec<VideoListEntry>> {
        AuthorizedEvent::load_for_series(self.key, context).await
    }

    /// Returns `true` if the realm has a series block with this series.
    /// Otherwise, `false` is returned.
    pub(crate) async fn is_referenced_by_realm(&self, path: String, context: &Context) -> ApiResult<bool> {
        let query = "select exists(\
            select 1 \
            from blocks \
            join realms on blocks.realm = realms.id \
            where realms.full_path = $1 and blocks.series = $2 \
        )";
        context.db.query_one(&query, &[&path.trim_end_matches('/'), &self.key])
            .await?
            .get::<_, bool>(0)
            .pipe(Ok)
    }
}

impl Node for Series {
    fn id(&self) -> Id {
        Id::series(self.key)
    }
}


#[derive(GraphQLInputObject)]
pub(crate) struct NewSeries {
    pub(crate) opencast_id: String,
    title: String,
    // TODO In the future this `struct` can be extended with additional
    // (potentially optional) fields. For now we only need these.
    // Since `mountSeries` feels even more like a private API
    // in some way, and since passing stuff like metadata isn't trivial either
    // I think it's okay to leave it at that for now.
}

impl LoadableAsset for Series {
    fn selection() -> (String, AssetMapping<<Self as FromDb>::RowMapping>) {
        let (selection, mapping) = select!(
            resource: Series from Series::select().with_omitted_table_prefix("series"),
        );
        (selection, mapping.resource)
    }

    fn table_name() -> &'static str {
        "series"
    }
}

// Todo: Make this generic. It's basically the same code that's used for `EventConnection`.
pub(crate) struct SeriesConnection {
    inner: Connection<Series>,
}

#[graphql_object(context = Context)]
impl SeriesConnection {
    fn page_info(&self) -> &PageInfo {
        &self.inner.page_info
    }
    fn items(&self) -> &Vec<Series> {
        &self.inner.items
    }
    fn total_count(&self) -> i32 {
        self.inner.total_count
    }
}
