use std::{collections::BTreeMap, future};

use chrono::{DateTime, Utc};
use juniper::{GraphQLObject, graphql_object};
use meilisearch_sdk::documents::DocumentsQuery;

use crate::{
    api::{err::ApiResult, Context}, auth::HasRoles, db::util::select, prelude::*, search::{self, IndexItemKind}
};


pub(crate) struct AdminInfo {}

impl AdminInfo {
    pub async fn new(context: &Context) -> Option<Self> {
        if !context.auth.is_tobira_admin(&context.config.auth) {
            return None;
        }

        Some(Self {})
    }
}

#[graphql_object(Context = Context)]
impl AdminInfo {
    async fn db(&self, context: &Context) -> ApiResult<AdminDbInfo> {
        AdminDbInfo::fetch(context).await
    }
    async fn search_index(&self, context: &Context) -> ApiResult<AdminSearchIndexInfo> {
        AdminSearchIndexInfo::fetch(context).await
    }
    async fn sync(&self, context: &Context) -> ApiResult<AdminSyncInfo> {
        AdminSyncInfo::fetch(context).await
    }
    async fn problems(&self, context: &Context) -> ApiResult<AdminProblemInfo> {
        AdminProblemInfo::fetch(context).await
    }

    async fn user_realms(&self, context: &Context) -> ApiResult<Vec<AdminUserRealmInfo>> {
        let (selection, mapping) = crate::db::util::select!(
           	full_path,
           	owner_display_name,
           	num_subpages: "(select count(*) from realms c where c.full_path like realms.full_path || '/%')",
        );
        let query = format!("
            select {selection}
            from realms
            where parent is null and full_path like '/@%'
            order by full_path
        ");

        let out = context.db.query_mapped(&query, dbargs![], |row| AdminUserRealmInfo {
            path: mapping.full_path.of(&row),
            owner_display_name: mapping.owner_display_name.of(&row),
            num_subpages: mapping.num_subpages.of::<i64>(&row) as i32,
        }).await?;

        Ok(out)
    }

    async fn user_sessions(&self, context: &Context) -> ApiResult<Vec<UserInfo>> {
        let (selection, mapping) = crate::db::util::select!(
           	username,
            display_name,
            roles,
            created,
            email,
            user_role,
            user_realm_handle,
        );
        let query = format!("select {selection} from user_sessions order by username");

        let mut out = <BTreeMap<String, Vec<_>>>::new();
        context.db.query_raw(&query, dbargs![]).await?.try_for_each(|row| {
            let username = mapping.username.of::<String>(&row);
            out.entry(username).or_default().push(UserSessionInfo {
                display_name: mapping.display_name.of(&row),
                roles: mapping.roles.of(&row),
                created: mapping.created.of::<DateTime<Utc>>(&row),
                email: mapping.email.of(&row),
                user_role: mapping.user_role.of(&row),
                user_realm_handle: mapping.user_realm_handle.of(&row),
            });
            future::ready(Ok(()))
        }).await?;

        Ok(out.into_iter().map(|(username, sessions)| UserInfo { username, sessions }).collect())
    }
}

#[derive(GraphQLObject)]
struct AdminUserRealmInfo {
    path: String,
    num_subpages: i32,
    owner_display_name: String,
}

#[derive(GraphQLObject)]
struct UserInfo {
    username: String,
    sessions: Vec<UserSessionInfo>,
}

#[derive(GraphQLObject)]
struct UserSessionInfo {
    display_name: String,
    roles: Vec<String>,
    created: DateTime<Utc>,
    email: Option<String>,
    user_role: String,
    user_realm_handle: Option<String>,
}

#[derive(GraphQLObject)]
pub struct AdminDbInfo {
    num_events: i32,
    num_events_pending_sync: i32,
    num_events_pending_deletion: i32,
    num_events_listed: i32,
    num_series: i32,
    num_series_pending_sync: i32,
    num_series_pending_deletion: i32,
    num_series_listed: i32,
    num_playlists: i32,
    num_playlists_listed: i32,
    num_realms: i32,
    num_user_realms: i32,
    num_blocks: i32,
    num_known_users: i32,
    num_known_groups: i32,
    num_user_sessions: i32,
    num_user_sessions_unique: i32,
    db_size: NumBytes,
}

impl AdminDbInfo {
    async fn fetch(ctx: &Context) -> ApiResult<Self> {
        let (selection, mapping) = select!(
            events: "(select count(*) from all_events)",
            events_pending_sync: "(select count(*) from all_events \
                where state <> 'ready')",
            events_pending_deletion: "(select count(*) from all_events \
                where tobira_deletion_timestamp is not null)",
            series: "(select count(*) from all_series)",
            series_pending_sync: "(select count(*) from all_series \
                where state <> 'ready')",
            series_pending_deletion: "(select count(*) from all_series \
                where tobira_deletion_timestamp is not null)",
            playlists: "(select count(*) from playlists)",
            realms: "(select count(*) from realms)",
            user_realms: "(select count(*) from realms where full_path ~ '^/@')",
            blocks: "(select count(*) from blocks)",
            known_users: "(select count(*) from users)",
            known_groups: "(select count(*) from known_groups)",
            user_sessions: "(select count(*) from user_sessions)",
            user_sessions_unique: "(select count(distinct username) from user_sessions)",
            db_size: "(select pg_database_size(current_database()))",
        );
        let row = ctx.db.query_one(&format!("select {selection}"), &[]).await?;

        let get_listed_count = |idx| async move {
            DocumentsQuery::new(idx)
                .with_filter("listed = true")
                .with_limit(0)
                .execute::<serde_json::Value>()
                .await
                .map(|res| res.total)
        };

        Ok(Self {
            num_events: mapping.events.of::<i64>(&row) as i32,
            num_events_pending_sync: mapping.events_pending_sync.of::<i64>(&row) as i32,
            num_events_pending_deletion: mapping.events_pending_deletion.of::<i64>(&row) as i32,
            num_events_listed: get_listed_count(&ctx.search.event_index).await? as i32,
            num_series: mapping.series.of::<i64>(&row) as i32,
            num_series_pending_sync: mapping.series_pending_sync.of::<i64>(&row) as i32,
            num_series_pending_deletion: mapping.series_pending_deletion.of::<i64>(&row) as i32,
            num_series_listed: get_listed_count(&ctx.search.series_index).await? as i32,
            num_playlists: mapping.playlists.of::<i64>(&row) as i32,
            num_playlists_listed: get_listed_count(&ctx.search.playlist_index).await? as i32,
            num_realms: mapping.realms.of::<i64>(&row) as i32,
            num_user_realms: mapping.user_realms.of::<i64>(&row) as i32,
            num_blocks: mapping.blocks.of::<i64>(&row) as i32,
            num_known_users: mapping.known_users.of::<i64>(&row) as i32,
            num_known_groups: mapping.known_groups.of::<i64>(&row) as i32,
            num_user_sessions: mapping.user_sessions.of::<i64>(&row) as i32,
            num_user_sessions_unique: mapping.user_sessions_unique.of::<i64>(&row) as i32,
            db_size: mapping.db_size.of::<i64>(&row) as f64,
        })
    }
}

#[derive(GraphQLObject)]
pub struct AdminSearchIndexInfo {
    is_healthy: bool,
    meili: Option<AdminMeiliInfo>,
    state: Option<String>,
    queue_len: i32,
    queued_events: i32,
    queued_series: i32,
    queued_playlists: i32,
    queued_realms: i32,
    queued_users: i32,
}

impl AdminSearchIndexInfo {
    async fn fetch(ctx: &Context) -> ApiResult<Self> {
        let rows = ctx.db.query_mapped(
            "select kind, count(*) from search_index_queue group by kind",
            dbargs![],
            |row| (row.get::<_, IndexItemKind>(0), row.get::<_, i64>(1)),
        ).await?;
        let mut queue_len = 0;
        let mut queued_events = 0;
        let mut queued_series = 0;
        let mut queued_playlists = 0;
        let mut queued_realms = 0;
        let mut queued_users = 0;
        for (kind, count) in rows {
            let count = count as i32;
            queue_len += count;
            match kind {
                IndexItemKind::Event => queued_events += count,
                IndexItemKind::Series => queued_series += count,
                IndexItemKind::Playlist => queued_playlists += count,
                IndexItemKind::Realm => queued_realms += count,
                IndexItemKind::User => queued_users += count,
            }
        }

        Ok(AdminSearchIndexInfo {
            is_healthy: ctx.search.check_connection().await.is_ok(),
            meili: AdminMeiliInfo::fetch(&ctx.search).await.ok(),
            state: ctx.search.index_state().await.ok().map(|state| match state {
                search::IndexState::NoVersionInfo => "no info".to_string(),
                search::IndexState::BrokenVersionInfo => "broken".to_string(),
                search::IndexState::Info { version, dirty } => format!(
                    "{version} ({})",
                    if dirty { "dirty" } else { "clean" },
                ),
            }),
            queue_len,
            queued_events,
            queued_series,
            queued_playlists,
            queued_realms,
            queued_users,
        })
    }
}

#[derive(GraphQLObject)]
pub struct AdminProblemInfo {
    realms_broken_name: Vec<String>,
    realms_broken_blocks: Vec<String>,
}

impl AdminProblemInfo {
    async fn fetch(ctx: &Context) -> ApiResult<Self> {
        let realms_broken_name = ctx.db.query_mapped(
            "select full_path from realms where realms.resolved_name is null and id <> 0",
            dbargs![],
            |row| row.get::<_, String>(0),
        ).await?;

        let realms_broken_blocks = ctx.db.query_mapped(
            "select realms.full_path from blocks
                inner join realms on realms.id = blocks.realm
                where video is not null and not exists(select from events where id = video)
               	or series is not null and not exists(select from series where id = series)
               	or playlist is not null and not exists(select from playlists where id = playlist)
                group by realms.id",
            dbargs![],
            |row| row.get::<_, String>(0),
        ).await?;

        Ok(Self {
            realms_broken_name,
            realms_broken_blocks,
        })
    }
}

#[derive(GraphQLObject)]
pub struct AdminMeiliInfo {
    version: String,
    size: NumBytes,
    last_update: Option<DateTime<Utc>>,
    event_index: Option<AdminSingleSearchIndexInfo>,
    series_index: Option<AdminSingleSearchIndexInfo>,
    playlist_index: Option<AdminSingleSearchIndexInfo>,
    realm_index: Option<AdminSingleSearchIndexInfo>,
    user_index: Option<AdminSingleSearchIndexInfo>,
}

impl AdminMeiliInfo {
    async fn fetch(search: &search::Client) -> Result<Self> {
        let version = search.client.get_version().await?.pkg_version;
        let stats = search.client.get_stats().await?;
        let index_info = |name: &str| stats.indexes.get(name).map(|stats| {
            AdminSingleSearchIndexInfo {
                num_documents: stats.number_of_documents as i32,
                is_indexing: stats.is_indexing,
            }
        });


        Ok(Self {
            version,
            size: stats.database_size as f64,
            last_update: stats.last_update
                .map(|dt| DateTime::from_timestamp_nanos(dt.unix_timestamp_nanos() as i64)),
            event_index: index_info(&search.event_index.uid),
            series_index: index_info(&search.series_index.uid),
            playlist_index: index_info(&search.playlist_index.uid),
            realm_index: index_info(&search.realm_index.uid),
            user_index: index_info(&search.user_index.uid),
        })
    }
}

#[derive(GraphQLObject)]
pub struct AdminSingleSearchIndexInfo {
    num_documents: i32,
    is_indexing: bool,
    // size: NumBytes, // TODO: add once we update minimum required meili version
}

/// Juniper by default only supports i32 integers, which is too small for the
/// sizes we deal with here. For simplicity we just use f64 to transmit the
/// integer.
type NumBytes = f64;

#[derive(GraphQLObject)]
pub struct AdminSyncInfo {
    oc_reachable: bool,
    harvested_until: DateTime<Utc>,
    last_updated_item: Option<DateTime<Utc>>,
    required_tobira_api_version: String,
    tobira_api_version: Option<String>,
    external_api_version: Option<String>,
}

impl AdminSyncInfo {
    async fn fetch(ctx: &Context) -> ApiResult<Self> {
        let sync_status = crate::sync::SyncStatus::fetch(ctx.db.inner()).await?;
        let last_updated_item = ctx.db.query_one("select greatest(
           	(select max(updated) from  events),
           	(select max(updated) from series),
           	(select max(updated) from playlists)
        )", &[]).await?.get(0);

        let tobira_api_version = ctx.oc_client.get_tobira_api_version().await.ok().map(|v| v.version);
        let external_api_version = ctx.oc_client.external_api_versions().await.ok().map(|v| v.default);
        Ok(Self {
            oc_reachable: tobira_api_version.is_some() && external_api_version.is_some(),
            harvested_until: sync_status.harvested_until,
            last_updated_item,
            required_tobira_api_version: {
                let v = crate::sync::MIN_REQUIRED_API_VERSION;
                format!("{}.{}", v.major, v.minor)
            },
            tobira_api_version,
            external_api_version,
        })
    }
}
