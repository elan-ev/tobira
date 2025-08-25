use chrono::{DateTime, Utc};
use futures:: StreamExt;
use hyper::StatusCode;
use juniper::{graphql_object, GraphQLEnum, GraphQLInputObject};
use postgres_types::ToSql;
use serde_json::json;

use crate::{
    api::{
        Context, Id, Node, NodeValue,
        err::{self, invalid_input, ApiError, ApiResult},
        model::{
            acl::{self, Acl},
            event::AuthorizedEvent,
            realm::Realm,
            shared::{SortDirection, ToSqlColumn, SearchFilter, convert_acl_input},
        },
        util::LazyLoad,
    },
    db::util::{impl_from_db, select},
    model::{
        ExtraMetadata,
        Key,
        SearchThumbnailInfo,
        SeriesThumbnailStack,
        SeriesState,
        ThumbnailInfo,
    },
    prelude::*,
    sync::client::{AclInput, OpencastItem},
};

use self::acl::AclInputEntry;
use super::block::mutations::DisplayOptions;

use super::{
    block::{BlockValue, NewSeriesBlock, VideoListLayout, VideoListOrder},
    playlist::VideoListEntry,
    realm::{NewRealm, RealmSpecifier, RemoveMountedSeriesOutcome, UpdatedRealmName},
    shared::{
        define_sort_column_and_order,
        load_writable_for_user,
        BasicMetadata,
        AclForDB,
        Connection,
        ConnectionQueryParts,
        PageInfo,
        SortOrder,
    },
};


#[derive(Clone)]
pub(crate) struct Series {
    pub(crate) key: Key,
    pub(crate) opencast_id: String,
    pub(crate) state: SeriesState,
    pub(crate) description: Option<String>,
    pub(crate) title: String,
    pub(crate) created: Option<DateTime<Utc>>,
    pub(crate) updated: Option<DateTime<Utc>>,
    pub(crate) metadata: Option<ExtraMetadata>,
    pub(crate) read_roles: Option<Vec<String>>,
    pub(crate) write_roles: Option<Vec<String>>,
    pub(crate) num_videos: LazyLoad<u32>,
    pub(crate) thumbnail_stack: LazyLoad<SeriesThumbnailStack>,
    pub(crate) tobira_deletion_timestamp: Option<DateTime<Utc>>,
}

impl_from_db!(
    Series,
    select: {
        series.{
            id, opencast_id, state,
            title, description,
            metadata, created,
            read_roles, write_roles,
            tobira_deletion_timestamp,
        },
        updated: "case \
            when ${table:series}.updated = '-infinity' then null \
            else ${table:series}.updated \
        end",
    },
    |row| {
        Series {
            key: row.id(),
            opencast_id: row.opencast_id(),
            state: row.state(),
            title: row.title(),
            created: row.created(),
            updated: row.updated(),
            metadata: row.metadata(),
            read_roles: row.read_roles(),
            write_roles: row.write_roles(),
            tobira_deletion_timestamp: row.tobira_deletion_timestamp(),
            description: row.description(),
            num_videos: LazyLoad::NotLoaded,
            thumbnail_stack: LazyLoad::NotLoaded,
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

    async fn load_for_mutation(id: Id, context: &Context) -> ApiResult<Series> {
        let series = Self::load_by_id(id, context)
            .await?
            .ok_or_else(|| err::invalid_input!(key = "series.not-found", "series not found"))?;

        if !context.auth.overlaps_roles(series.write_roles.as_deref().unwrap_or(&[])) {
            return Err(err::not_authorized!(key = "series.not-allowed", "series action not allowed"));
        }

        Ok(series)
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

    pub(crate) async fn create(
        series: NewSeries,
        acl: Option<AclForDB>,
        context: &Context,
    ) -> ApiResult<Self> {
        let (read_roles, write_roles) = match &acl {
            Some(roles) => (Some(&roles.read_roles), Some(&roles.write_roles)),
            None => (None, None),
        };

        let selection = Self::select().with_renamed_table("series", "all_series");
        let query = format!(
            "insert into all_series ( \
                opencast_id, title, description, state, \
                created, updated, read_roles, write_roles \
            ) \
            values ($1, $2, $3, 'waiting', now(), '-infinity', $4, $5) \
            returning {selection}",
        );

        if context.auth.can_create_series(&context.config.auth) {
            context.db
                .query_one(&query, &[
                    &series.opencast_id,
                    &series.title,
                    &series.description,
                    &read_roles,
                    &write_roles,
                ]).await?
                .pipe(|row| Self::from_row_start(&row))
                .pipe(Ok)
        } else {
            Err(err::not_authorized!(key = "series.not-allowed", "not allowed to create series"))
        }
    }

    pub(crate) async fn create_in_oc(
        metadata: BasicMetadata,
        acl: Vec<AclInputEntry>,
        context: &Context,
    ) -> ApiResult<Self> {
        if !context.auth.can_create_series(&context.config.auth) {
            return Err(err::not_authorized!(key = "series.not-allowed", "series action not allowed"));
        }
        let response = context
            .oc_client
            .create_series(&acl, &metadata.title, metadata.description.as_deref())
            .await
            .map_err(|e| {
                error!("Failed to create series in Opencast: {}", e);
                err::opencast_unavailable!("Failed to create series")
            })?;

        let db_acl = Some(convert_acl_input(acl));

        // If the request returned an Opencast identifier, the series was created successfully.
        // The series is created in the database, so the user doesn't have to wait for sync to see
        // the new series in the "My series" overview.
        let series = Self::create(
            NewSeries {
                opencast_id: response.identifier,
                title: metadata.title,
                description: metadata.description,
            },
            db_acl,
            context,
        ).await?;

        Ok(series)
    }

    pub(crate) async fn announce(series: NewSeries, context: &Context) -> ApiResult<Self> {
        context.auth.required_trusted_external()?;
        Self::create(series, None, context).await
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
                display_options: DisplayOptions {
                    show_title: Some(false),
                    show_metadata: Some(true),
                    show_link: None,
                },
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
        let series = Series::create(series, None, context).await?;

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
        filter: Option<SearchFilter>,
    ) -> ApiResult<Connection<Series>> {
        let parts = ConnectionQueryParts {
            table: "all_series",
            alias: Some("series"),
            join_clause: "",
        };
        let (selection, mapping) = select!(
            series: Series,
            num_videos: "(select count(*) from events where events.series = series.id)",
            thumbnails: "array(\
                select search_thumbnail_info_for_event(events.*) \
                from events \
                where events.series = series.id)",
        );
        load_writable_for_user(context, order, offset, limit, parts, selection, |row| {
            let mut out = Self::from_row(row, mapping.series);
            out.num_videos = LazyLoad::Loaded(mapping.num_videos.of::<i64>(row) as u32);
            out.thumbnail_stack = LazyLoad::Loaded(SeriesThumbnailStack {
                thumbnails: mapping.thumbnails.of::<Vec<SearchThumbnailInfo>>(row)
                    .into_iter()
                    .filter_map(|info| ThumbnailInfo::from_search(info, &context.auth))
                    .collect(),
            });
            out
        }, filter).await
    }

    pub(crate) async fn update_acl(id: Id, acl: Vec<AclInputEntry>, context: &Context) -> ApiResult<Series> {
        if !context.config.general.allow_acl_edit {
            return Err(err::not_authorized!("editing ACLs is not allowed"));
        }

        info!(series_id = %id, "Requesting ACL update of series");
        let series = Self::load_for_mutation(id, context).await?;

        let response = context
            .oc_client
            .update_acl(&series, &acl, context)
            .await
            .map_err(|e| {
                error!("Failed to send ACL update request: {}", e);
                err::opencast_unavailable!("Failed to send ACL update request")
            })?;

        if response.status() == StatusCode::OK {
            // 200: The updated access control list is returned.
            let db_acl = convert_acl_input(acl);

            context.db.execute("\
                update all_series \
                set read_roles = $2, write_roles = $3 \
                where id = $1 \
            ", &[&series.key, &db_acl.read_roles, &db_acl.write_roles]).await?;

            Self::load_for_mutation(id, context).await
        } else {
            warn!(
                series_id = %id,
                "Failed to update series ACL, OC returned status: {}",
                response.status(),
            );
            Err(err::opencast_error!("Opencast API error: {}", response.status()))
        }
    }

    pub(crate) async fn update_metadata(
        id: Id,
        metadata: BasicMetadata,
        context: &Context,
    ) -> ApiResult<Series> {
        let series = Self::load_for_mutation(id, context).await?;

        info!(series_id = %id, "Requesting metadata update of series");

        let metadata_json = serde_json::json!([
            {
                "id": "title",
                "value": metadata.title
            },
            {
                "id": "description",
                "value": metadata.description
            },
        ]);

        let response = context
            .oc_client
            .update_metadata(&series, &metadata_json)
            .await
            .map_err(|e| {
                error!("Failed to send metadata update request: {}", e);
                err::opencast_unavailable!("Failed to send metadata update request")
            })?;

        if response.status() == StatusCode::OK {
            // 200: The series' metadata has been updated.
            context.db.execute("\
                update series \
                set title = $2, description = $3 \
                where id = $1 \
            ", &[&series.key, &metadata.title, &metadata.description]).await?;

            Self::load_for_mutation(id, context).await
        } else {
            warn!(
                series_id = %id,
                "Failed to update series metadata, OC returned status: {}",
                response.status(),
            );
            Err(err::opencast_error!("Opencast API error: {}", response.status()))
        }
    }

    pub(crate) async fn update_content(
        id: Id,
        added_events: Vec<Id>,
        removed_events: Vec<Id>,
        context: &Context,
    ) -> ApiResult<Series> {
        let series = Self::load_for_mutation(id, context).await?;

        info!(series_id = %id, "Starting content update of series");

        let added_events = added_events.iter().map(|e| (*e, true));
        let removed_events = removed_events.iter().map(|e| (*e, false));
        let modified_events = added_events.chain(removed_events);

        // Load modified events to get their Opencast id and check input.
        let changes = futures::stream::iter(modified_events)
            .then(|(id, add)| async move {
                let event = AuthorizedEvent::load_for_mutation(id, context).await
                    .map_err(|_| err::not_authorized!(
                        key = "series.not-allowed",
                        "missing write access to event {id}",
                    ))?;
                if add && event.series.is_some() {
                    return Err(err::invalid_input!("event {id} is already in another series"));
                }
                if !add && event.series.as_ref().map(|s| s.key) != Some(series.key) {
                    return Err(err::invalid_input!("event {id} is not part of the series"));
                }
                Ok::<_, ApiError>((event, add))
            })
            .try_collect::<Vec<_>>()
            .await?;

        let mut events_to_update = Vec::new();

        for (event, add) in &changes {
            let metadata = json!([{
                "id": "isPartOf",
                "value": add.then_some(&series.opencast_id),
            }]);

            let response = context
                .oc_client
                .update_metadata(event, &metadata)
                .await
                .map_err(|e| {
                    error!("Failed to set series: {}", e);
                    err::opencast_unavailable!("Failed to set series")
                })?;

            let event_id = OpencastItem::id(event);

            if response.status() == StatusCode::NO_CONTENT {
                // 204: The metadata of the given namespace (i.e. "isPartOf") has been updated.
                info!(event_id, "Event updated, attempting metadata republish");

                if let Err(e) = AuthorizedEvent::start_workflow(
                    &event.opencast_id,
                    "republish-metadata",
                    context,
                ).await {
                    warn!(
                        event_id,
                        error = %e.msg,
                        "Failed to republish metadata for event"
                    );
                    continue;
                }

                events_to_update.push(event.key);
            } else {
                warn!(
                    event_id,
                    "Failed to update event, OC returned status: {}",
                    response.status(),
                );
            }
        }

        // Update events in Tobira
        if !events_to_update.is_empty() {
            let query = "\
                update events \
                set \
                    series = nullif($2, series), \
                    part_of = nullif($3, part_of) \
                where id = any($1) \
            ";

            context.db.execute(query, &[
                &events_to_update,
                &series.key,
                &series.opencast_id,
            ]).await?;
        }

        Self::load_for_mutation(id, context).await
    }

    pub(crate) async fn delete(id: Id, context: &Context) -> ApiResult<Series> {
        let series = Self::load_for_mutation(id, context).await?;

        info!(series_id = %id, "Attempting to send request to delete series in Opencast");

        context.db.execute("\
            update all_series \
            set tobira_deletion_timestamp = current_timestamp \
            where id = $1 \
        ", &[&series.key]).await?;

        context.db.execute("\
            update all_events \
            set series = null, part_of = null \
            where series = $1 \
        ", &[&series.key]).await?;


        let oc_client = context.oc_client.clone();
        let series_clone = series.clone();

        // Unfortunately we can't wait for the http response. The Opencast delete endpoint will
        // automatically start `republish metadata` workflows for all events in the series, which
        // takes roughly 10 seconds per event, and only returns once all have finished.
        // This would block the request for a long time.
        tokio::spawn(async move {
            let response = match oc_client.delete(&series_clone).await {
                Ok(response) => response,
                Err(e) => {
                    error!("Failed to send delete request: {}", e);
                    return;
                }
            };

            if response.status() == StatusCode::NO_CONTENT {
                info!(series_id = %id, "Series successfully deleted");
            } else {
                // This is kinda pointless. Depending on the number of videos, the request takes
                // super long to respond and will potentially return with `504 Gateway Timeout`.
                // This is not necessarily an error in this case as the deletion could still be
                // in progress.
                warn!(
                    series_id = %id,
                    "Failed to delete series, Opencast returned status: {}",
                    response.status()
                );
            }
            // Todo: Consider reverting DB changes on error or unexpected response.
        });

        Ok(series)
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

    fn updated(&self) -> &Option<DateTime<Utc>> {
        &self.updated
    }

    fn metadata(&self) -> &Option<ExtraMetadata> {
        &self.metadata
    }

    fn description(&self) -> &Option<String> {
        &self.description
    }

    fn state(&self) -> SeriesState {
        self.state
    }

    fn num_videos(&self) -> i32 {
        self.num_videos.unwrap() as i32
    }

    fn thumbnail_stack(&self) -> &SeriesThumbnailStack {
        self.thumbnail_stack.as_ref().unwrap()
    }

    async fn acl(&self, context: &Context) -> ApiResult<Option<Acl>> {
        self.load_acl(context).await
    }

    /// Whether the current user has write access to this series.
    fn can_write(&self, context: &Context) -> bool {
        self.write_roles.as_ref().is_some_and(|roles| context.auth.overlaps_roles(roles))
    }

    fn tobira_deletion_timestamp(&self) -> &Option<DateTime<Utc>> {
        &self.tobira_deletion_timestamp
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

impl OpencastItem for Series {
    fn endpoint_path(&self) -> &'static str {
        "series"
    }
    fn id(&self) -> &str {
        &self.opencast_id
    }

    fn metadata_flavor(&self) -> &'static str {
        "dublincore/series"
    }

    async fn extra_roles(&self, _context: &Context, _oc_id: &str) -> Result<Vec<AclInput>> {
        // Series do not have custom or preview roles.
        Ok(vec![])
    }
}


#[derive(GraphQLInputObject)]
pub(crate) struct NewSeries {
    pub(crate) opencast_id: String,
    title: String,
    description: Option<String>,
    // TODO In the future this `struct` can be extended with additional
    // (potentially optional) fields. For now we only need these.
    // Since `mountSeries` feels even more like a private API
    // in some way, and since passing stuff like metadata isn't trivial either
    // I think it's okay to leave it at that for now.
}

#[graphql_object(name = "SeriesConnection", context = Context)]
impl Connection<Series> {
    fn page_info(&self) -> &PageInfo {
        &self.page_info
    }
    fn items(&self) -> &Vec<Series> {
        &self.items
    }
    fn total_count(&self) -> i32 {
        self.total_count
    }
}

define_sort_column_and_order!(
    pub enum SeriesSortColumn {
        Title      => "title",
        #[default]
        Created    => "created",
        Updated    => "updated",
        EventCount => "(select count(*) from events where events.series = series.id)",
    };
    pub struct SeriesSortOrder
);
