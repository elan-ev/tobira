use chrono::{DateTime, Utc};
use hyper::StatusCode;
use postgres_types::ToSql;
use juniper::{
    graphql_object,
    GraphQLInputObject,
    Executor,
    GraphQLEnum,
    GraphQLObject,
    ScalarValue,
};
use sha1::{Sha1, Digest};

use crate::{
    api::{
        common::NotAllowed,
        err::{self, ApiResult},
        model::{
            acl::{self, Acl},
            realm::Realm,
            series::Series,
            shared::{ToSqlColumn, SortDirection, convert_acl_input}
        },
        Context,
        Id,
        Node,
        NodeValue,
        util::LazyLoad,
    },
    db::{
        types::{Credentials, EventCaption, EventSegment, EventState, EventTrack},
        util::impl_from_db,
    },
    model::{ExtraMetadata, Key, SeriesState},
    prelude::*,
    sync::client::{AclInput, OpencastItem}
};

use self::acl::AclInputEntry;

use super::{
    playlist::VideoListEntry,
    shared::{
        define_sort_column_and_order,
        load_writable_for_user,
        BasicMetadata,
        Connection,
        ConnectionQueryParts,
        PageInfo,
        SortOrder,
    },
};


#[derive(Debug)]
pub(crate) struct AuthorizedEvent {
    pub(crate) key: Key,
    pub(crate) series: Option<PreloadedSeries>,
    pub(crate) opencast_id: String,
    pub(crate) is_live: bool,

    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) created: DateTime<Utc>,
    pub(crate) creators: Vec<String>,

    pub(crate) metadata: ExtraMetadata,
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,
    pub(crate) preview_roles: Vec<String>,
    pub(crate) credentials: Option<Credentials>,

    pub(crate) synced_data: Option<SyncedEventData>,
    pub(crate) authorized_data: Option<AuthorizedEventData>,
    pub(crate) tobira_deletion_timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug)]
pub(crate) struct PreloadedSeries {
    pub(crate) key: Key,
    pub(crate) opencast_id: String,
    pub(crate) title: String,
}

#[derive(Debug)]
pub(crate) struct SyncedEventData {
    updated: DateTime<Utc>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    thumbnail: Option<String>,
    /// Duration in milliseconds
    duration: i64,
    audio_only: bool,
}

#[derive(Debug)]
pub(crate) struct AuthorizedEventData {
    tracks: Vec<Track>,
    captions: Vec<Caption>,
    segments: Vec<Segment>,
}

impl_from_db!(
    AuthorizedEvent,
    select: {
        events.{
            id, state, series, opencast_id, is_live,
            title, description, duration, creators, thumbnail, metadata,
            created, updated, start_time, end_time,
            tracks, captions, segments,
            read_roles, write_roles, preview_roles, credentials,
            tobira_deletion_timestamp,
        },
        series.{ series_title: "title", series_oc_id: "opencast_id" },
    },
    |row| {
        let tracks: Vec<Track> = row.tracks::<Vec<EventTrack>>().into_iter().map(Track::from).collect();
        let series = row.series::<Option<Key>>().map(|key| PreloadedSeries {
            key,
            opencast_id: row.series_oc_id(),
            title: row.series_title(),
        });
        Self {
            key: row.id(),
            series: series,
            opencast_id: row.opencast_id(),
            is_live: row.is_live(),
            title: row.title(),
            description: row.description(),
            created: row.created(),
            creators: row.creators(),
            metadata: row.metadata(),
            read_roles: row.read_roles::<Vec<String>>(),
            write_roles: row.write_roles::<Vec<String>>(),
            preview_roles: row.preview_roles::<Vec<String>>(),
            credentials: row.credentials(),
            tobira_deletion_timestamp: row.tobira_deletion_timestamp(),
            synced_data: match row.state::<EventState>() {
                EventState::Ready => Some(SyncedEventData {
                    updated: row.updated(),
                    start_time: row.start_time(),
                    end_time: row.end_time(),
                    duration: row.duration(),
                    thumbnail: row.thumbnail(),
                    audio_only: tracks.iter().all(|t| t.resolution.is_none()),
                }),
                EventState::Waiting => None,
            },
            authorized_data: match row.state::<EventState>() {
                EventState::Ready => Some(AuthorizedEventData {
                    tracks,
                    captions: row.captions::<Vec<EventCaption>>()
                        .into_iter()
                        .map(Caption::from)
                        .collect(),
                    segments: row.segments::<Vec<EventSegment>>()
                        .into_iter()
                        .map(Segment::from)
                        .collect(),
                }),
                EventState::Waiting => None,
            },
        }
    }
);


#[derive(Debug, GraphQLObject)]
pub(crate) struct Track {
    uri: String,
    flavor: String,
    mimetype: Option<String>,
    resolution: Option<[i32; 2]>,
    is_master: Option<bool>,
}

#[derive(Debug, GraphQLObject)]
pub(crate) struct Caption {
    uri: String,
    lang: Option<String>,
}

#[derive(Debug, GraphQLObject)]
pub(crate) struct Segment {
    uri: String,
    start_time: f64,
}

impl Node for AuthorizedEvent {
    fn id(&self) -> Id {
        Id::event(self.key)
    }
}

#[graphql_object(Context = Context)]
impl SyncedEventData {
    fn updated(&self) -> DateTime<Utc> {
        self.updated
    }
    fn start_time(&self) -> Option<DateTime<Utc>> {
        self.start_time
    }
    fn end_time(&self) -> Option<DateTime<Utc>> {
        self.end_time
    }
    /// Duration in ms.
    fn duration(&self) -> f64 {
        self.duration as f64
    }
    fn thumbnail(&self) -> Option<&str> {
        self.thumbnail.as_deref()
    }
    fn audio_only(&self) -> bool {
        self.audio_only
    }
}

/// Represents event data that is only accessible for users with read access
/// and event-specific authenticated users.
#[graphql_object(Context = Context)]
impl AuthorizedEventData {
    fn tracks(&self) -> &[Track] {
        &self.tracks
    }
    fn captions(&self) -> &[Caption] {
        &self.captions
    }
    fn segments(&self) -> &[Segment] {
        &self.segments
    }
}

#[graphql_object(Context = Context, impl = NodeValue)]
impl AuthorizedEvent {
    fn id(&self) -> Id {
        Node::id(self)
    }
    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }
    fn is_live(&self) -> bool {
        self.is_live
    }
    fn title(&self) -> &str {
        &self.title
    }
    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
    fn created(&self) -> DateTime<Utc> {
        self.created
    }
    fn creators(&self) -> &Vec<String> {
        &self.creators
    }
    fn metadata(&self) -> &ExtraMetadata {
        &self.metadata
    }
    /// This doesn't contain `ROLE_ADMIN` as that is included implicitly.
    fn read_roles(&self) -> &[String] {
        &self.read_roles
    }
    /// This doesn't contain `ROLE_ADMIN` as that is included implicitly.
    fn write_roles(&self) -> &[String] {
        &self.write_roles
    }
    /// This doesn't contain `ROLE_ADMIN` as that is included implicitly.
    fn preview_roles(&self) -> &[String] {
        &self.preview_roles
    }

    fn synced_data(&self) -> &Option<SyncedEventData> {
        &self.synced_data
    }

    /// Returns the authorized event data if the user has read access or is authenticated for the event.
    async fn authorized_data(
        &self,
        context: &Context,
        user: Option<String>,
        password: Option<String>,
    ) -> Option<&AuthorizedEventData> {
        let sha1_matches = |input: &str, encoded: &str| {
            let (algo, hash) = encoded.split_once(':').expect("invalid credentials in DB");
            match algo {
                "sha1" => hash == hex::encode_upper(Sha1::digest(input)),
                _ => unreachable!("unsupported hash algo"),
            }
        };

        let credentials_match = self.credentials.as_ref().map_or(false, |credentials| {
            user.map_or(false, |u| sha1_matches(&u, &credentials.name))
                && password.map_or(false, |p| sha1_matches(&p, &credentials.password))
        });

        if context.auth.overlaps_roles(&self.read_roles, &context.config.auth) || credentials_match {
            self.authorized_data.as_ref()
        } else {
            None
        }
    }

    /// Whether the current user has write access to this event.
    fn can_write(&self, context: &Context) -> bool {
        context.auth.overlaps_roles(&self.write_roles, &context.config.auth)
    }

    fn tobira_deletion_timestamp(&self) -> &Option<DateTime<Utc>> {
        &self.tobira_deletion_timestamp
    }

    /// Whether the event has active workflows.
    async fn workflow_status(&self, context: &Context) -> ApiResult<WorkflowStatus> {
        if !context.auth.overlaps_roles(&self.write_roles, &context.config.auth) {
            return Err(err::not_authorized!(
                key = "event.workflow.not-allowed",
                "you are not allowed to inquire about this event's workflow activity",
            ));
        }

        let status = match context.oc_client.has_active_workflows(&self.opencast_id).await {
            Ok(true) => WorkflowStatus::Busy,
            Ok(false) => WorkflowStatus::Idle,
            Err(e) => {
                error!("Failed to get workflow activity: {}", e);
                WorkflowStatus::Unobtainable
            }
        };

        Ok(status)
    }

    async fn series<S: ScalarValue>(
        &self,
        context: &Context,
        executor: &Executor<'_, '_, Context, S>,
    ) -> ApiResult<Option<Series>> {
        if let Some(series) = &self.series {
            let preloaded_fields = ["id", "title", "opencastId"];

            if executor.look_ahead().children().names().all(|n| preloaded_fields.contains(&n)) {
                // All requested fields are already preloaded. It would be nicer
                // to have a separate type here and return
                // `Either<PreloadedSeries, Series>` but in the case of the
                // series, we can just use the normal type and pass `None` for
                // other fields. We know those fields are never read.
                Ok(Some(Series {
                    key: series.key,
                    opencast_id: series.opencast_id.clone(),
                    title: series.title.clone(),
                    description: None,
                    state: SeriesState::Ready,
                    created: None,
                    updated: None,
                    metadata: None,
                    read_roles: None,
                    write_roles: None,
                    num_videos: LazyLoad::NotLoaded,
                    thumbnail_stack: LazyLoad::NotLoaded,
                    tobira_deletion_timestamp: None,
                }))
            } else {
                // We need to load the series as fields were requested that were not preloaded.
                Ok(Series::load_by_key(series.key, context).await?)
            }
        } else {
            Ok(None)
        }
    }

    /// Returns a list of realms where this event is referenced (via some kind of block).
    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        let selection = Realm::select();
        let query = format!("\
            select {selection} \
            from realms \
            where exists ( \
                select from blocks \
                where realm = realms.id and does_block_make_event_listed(blocks, $1, $2, $3) \
            ) \
        ");
        context.db.query_mapped(
            &query,
            dbargs![&self.key, &self.series_key(), &self.opencast_id],
            |row| Realm::from_row_start(&row)
        ).await?.pipe(Ok)
    }


    /// Whether this event is password protected.
    async fn has_password(&self) -> bool {
        self.credentials.is_some()
    }

    async fn acl(&self, context: &Context) -> ApiResult<Acl> {
        let raw_roles_sql = "\
            select unnest(read_roles) as role, 'read' as action from events where id = $1
            union
            select unnest(write_roles) as role, 'write' as action from events where id = $1
        ";
        acl::load_for(context, raw_roles_sql, dbargs![&self.key]).await
    }

    /// Returns `true` if the realm has a video block with this video
    /// OR if the realm has a series or playlist block including this video.
    /// Otherwise, `false` is returned.
    pub(crate) async fn is_referenced_by_realm(&self, path: String, context: &Context) -> ApiResult<bool> {
        let query = "select exists(\
            select from blocks \
            join realms on blocks.realm = realms.id \
            where realms.full_path = $1 and does_block_make_event_listed(blocks, $2, $3, $4) \
        )";
        context.db.query_one(&query, &[&path.trim_end_matches('/'), &self.key, &self.series_key(), &self.opencast_id])
            .await?
            .get::<_, bool>(0)
            .pipe(Ok)
    }
}

#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum Event {
    Event(AuthorizedEvent),
    NotAllowed(NotAllowed),
}

impl Event {
    pub(crate) fn into_result(self) -> ApiResult<AuthorizedEvent> {
        match self {
            Self::Event(e) => Ok(e),
            Self::NotAllowed(_) => Err(err::not_authorized!(
                key = "view.event",
                "you cannot view this event",
            )),
        }
    }
}

impl AuthorizedEvent {
    pub(crate) async fn load_by_id(id: Id, context: &Context) -> ApiResult<Option<Event>> {
        match id.key_for(Id::EVENT_KIND) {
            None => return Ok(None),
            Some(key) => Self::load_by_any_id_impl("id", &key, context).await,
        }
    }

    pub(crate) async fn load_by_opencast_id(oc_id: String, context: &Context) -> ApiResult<Option<Event>> {
        Self::load_by_any_id_impl("opencast_id", &oc_id, context).await
    }

    pub(crate) async fn load_by_any_id_impl(
        col: &str,
        id: &(dyn ToSql + Sync),
        context: &Context,
    ) -> ApiResult<Option<Event>> {
        let selection = Self::select();
        let query = format!("select {selection} from events \
            left join series on series.id = events.series \
            where events.{col} = $1");
        context.db
            .query_opt(&query, &[id])
            .await?
            .map(|row| {
                let event = Self::from_row_start(&row);
                if event.can_be_previewed(context) {
                    Event::Event(event)
                } else {
                    Event::NotAllowed(NotAllowed)
                }
            })
            .pipe(Ok)
    }

    pub(crate) async fn load_for_series(
        series_key: Key,
        context: &Context,
    ) -> ApiResult<Vec<VideoListEntry>> {
        let selection = Self::select();
        let query = format!(
            "select {selection} from series \
                inner join events on events.series = series.id \
                where series.id = $1",
        );
        context.db
            .query_mapped(&query, dbargs![&series_key], |row| {
                let event = Self::from_row_start(&row);
                if !event.can_be_previewed(context) {
                    return VideoListEntry::NotAllowed(NotAllowed);
                }

                VideoListEntry::Event(event)
            })
            .await?
            .pipe(Ok)
    }

    fn can_be_previewed(&self, context: &Context) -> bool {
        context.auth.overlaps_roles(&self.preview_roles, &context.config.auth)
            || context.auth.overlaps_roles(&self.read_roles, &context.config.auth)
    }

    fn series_key(&self) -> Option<Key> {
        self.series.as_ref().map(|s| s.key)
    }

    pub (crate) async fn load_for_mutation(
        id: Id,
        context: &Context,
    ) -> ApiResult<AuthorizedEvent> {
        let event = Self::load_by_id(id, context)
            .await?
            .ok_or_else(||  err::invalid_input!(key = "event.not-found", "event not found"))?
            .into_result()?;

        if !context.auth.overlaps_roles(&event.write_roles, &context.config.auth) {
            return Err(err::not_authorized!(key = "event.not-allowed", "event action not allowed"));
        }

        Ok(event)
    }

    /// Checks the current workflow status for this event. If a workflow is active or
    /// the status cannot be determined, returns a localized error blocking the operation.
    /// Used to guard mutation operations that also start workflows.
    pub(crate) async fn require_idle(&self, context: &Context) -> ApiResult<()> {
        match Self::workflow_status(self, context).await? {
            WorkflowStatus::Idle => Ok(()),
            WorkflowStatus::Busy => Err(err::opencast_error!(
                key = "event.workflow.active",
                "Cannot perform operation: another workflow is still active"
            )),
            WorkflowStatus::Unobtainable => Err(err::opencast_error!(
                key = "event.workflow.unknown-status",
                "Cannot perform operation: workflow status could not be determined"
            )),
        }
    }

    pub(crate) async fn create_placeholder(event: NewEvent, context: &Context) -> ApiResult<Self> {
        if !context.auth.can_upload(&context.config.auth) {
            return Err(err::not_authorized!(
                key = "upload.not-authorized",
                "user does not have permission to upload,
            "));
        }
        let query = format!("\
            insert into all_events ( \
                opencast_id, title, description, \
                creators, series, tracks, \
                read_roles, write_roles, preview_roles, \
                metadata, is_live, updated, created, state \
            ) values ( \
                $1, $2, $3, $4, $5, '{{}}', $6, $7, \
                '{{}}', '{{}}', false, '-infinity', now(), 'waiting' \
            ) returning id \
        ");

        let acl = convert_acl_input(event.acl);

        context.db.execute(&query, &[
            &event.opencast_id,
            &event.title,
            &event.description,
            &event.creators,
            &event.series_id.map(|id| id.key_for(Id::SERIES_KIND)),
            &acl.read_roles,
            &acl.write_roles,
        ]).await?;

        let event = Self::load_by_opencast_id(event.opencast_id, context)
            .await?
            .unwrap()
            .into_result()?;
        Ok(event)
    }

    pub(crate) async fn delete(id: Id, context: &Context) -> ApiResult<AuthorizedEvent> {
        let event = Self::load_for_mutation(id, context).await?;

        let response = context
            .oc_client
            .delete(&event)
            .await
            .map_err(|e| {
                error!("Failed to send delete request: {}", e);
                err::opencast_unavailable!("Failed to communicate with Opencast")
            })?;

        if response.status() == StatusCode::ACCEPTED {
            // 202: The retraction of publications has started.
            info!(event_id = %id, "Requested deletion of event");
            context.db.execute("\
                update all_events \
                set tobira_deletion_timestamp = current_timestamp \
                where id = $1 \
            ", &[&event.key]).await?;
            Ok(event)
        } else {
            warn!(
                event_id = %id,
                "Failed to delete event, OC returned status: {}",
                response.status()
            );
            Err(err::opencast_unavailable!("Opencast API error: {}", response.status()))
        }
    }

    pub(crate) async fn update_acl(id: Id, acl: Vec<AclInputEntry>, context: &Context) -> ApiResult<AuthorizedEvent> {
        if !context.config.general.allow_acl_edit {
            return Err(err::not_authorized!("editing ACLs is not allowed"));
        }

        let event = Self::load_for_mutation(id, context).await?;
        event.require_idle(context).await?;

        info!(event_id = %id, "Requesting ACL update of event");

        let response = context
            .oc_client
            .update_acl(&event, &acl, context)
            .await
            .map_err(|e| {
                error!("Failed to send ACL update request: {}", e);
                err::opencast_unavailable!("Failed to send ACL update request")
            })?;

        if response.status() == StatusCode::NO_CONTENT {
            // 204: The access control list for the specified event is updated.
            Self::start_workflow(&event.opencast_id, "republish-metadata", &context).await?;
            let db_acl = convert_acl_input(acl);

            // Todo: also update custom and preview roles once frontend sends these
            context.db.execute("\
                update all_events \
                set read_roles = $2, write_roles = $3 \
                where id = $1 \
            ", &[&event.key, &db_acl.read_roles, &db_acl.write_roles]).await?;

            Self::load_for_mutation(id, context).await
        } else {
            warn!(
                event_id = %id,
                "Failed to update event ACL, OC returned status: {}",
                response.status(),
            );
            Err(err::opencast_error!("Opencast API error: {}", response.status()))
        }
    }

    pub(crate) async fn update_metadata(
        id: Id,
        metadata: BasicMetadata,
        context: &Context,
    ) -> ApiResult<AuthorizedEvent> {
        let event = Self::load_for_mutation(id, context).await?;
        event.require_idle(context).await?;

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

        info!(event_id = %id, "Requesting metadata update of event");

        let response = context
            .oc_client
            .update_metadata(&event, &metadata_json)
            .await
            .map_err(|e| {
                error!("Failed to send metadata update request: {}", e);
                err::opencast_unavailable!("Failed to send metadata update request")
            })?;

        if response.status() == StatusCode::NO_CONTENT {
            // 204: The metadata of the given namespace has been updated.
            Self::start_workflow(&event.opencast_id, "republish-metadata", &context).await?;

            context.db.execute("\
                update all_events \
                set title = $2, description = $3 \
                where id = $1 \
            ", &[&event.key, &metadata.title, &metadata.description]).await?;

            Self::load_for_mutation(id, context).await
        } else {
            warn!(
                event_id = %id,
                "Failed to update event metadata, OC returned status: {}",
                response.status(),
            );
            Err(err::opencast_error!("Opencast API error: {}", response.status()))
        }
    }

    /// Starts a workflow on the event.
    pub(crate) async fn start_workflow(
        oc_id: &str,
        workflow_id: &str,
        context: &Context,
    ) -> ApiResult<StatusCode> {
        let response = context
            .oc_client
            .start_workflow(&oc_id, workflow_id)
            .await
            .map_err(|e| {
                error!("Failed sending request to start workflow: {}", e);
                err::opencast_unavailable!("Failed to communicate with Opencast")
            })?;

        if response.status() == StatusCode::CREATED {
            // 201: A new workflow is created.
            info!(%workflow_id, event_id = %oc_id, "Requested creation of workflow");
            Ok(response.status())
        } else if response.status() == StatusCode::NOT_FOUND {
            // 404: The specified workflow instance does not exist.
            warn!(%workflow_id, event_id = %oc_id, "The specified workflow instance does not exist.");
            Err(err::opencast_error!("Opencast API error: {}", response.status()))
        } else {
            warn!(
                %workflow_id,
                event_id = %oc_id,
                "Failed to create workflow, OC returned status: {}",
                response.status(),
            );
            Err(err::opencast_error!("Opencast API error: {}", response.status()))
        }
    }

    pub(crate) async fn load_writable_for_user(
        context: &Context,
        order: SortOrder<VideosSortColumn>,
        offset: i32,
        limit: i32,
    ) -> ApiResult<Connection<AuthorizedEvent>> {
        let parts = ConnectionQueryParts {
            table: "all_events",
            alias: Some("events"),
            join_clause: "left join series on series.id = events.series",
        };

        load_writable_for_user(
            context, order, offset, limit, parts,
            AuthorizedEvent::select(),
            AuthorizedEvent::from_row_start,
        ).await
    }
}


impl OpencastItem for AuthorizedEvent {
    fn endpoint_path(&self) -> &'static str {
        "events"
    }
    fn id(&self) -> &str {
        &self.opencast_id
    }

    fn metadata_flavor(&self) -> &'static str {
        "dublincore/episode"
    }

    async fn extra_roles(&self, context: &Context, oc_id: &str) -> Result<Vec<AclInput>> {
        let query = "\
            select unnest(preview_roles) as role, 'preview' as action from events where opencast_id = $1
            union
            select role, key as action
            from jsonb_each_text(
                (select custom_action_roles from events where opencast_id = $1)
            ) as actions(key, value)
            cross join lateral jsonb_array_elements_text(value::jsonb) as role(role)
        ";

        context.db.query_mapped(&query, dbargs![&oc_id], |row| {
            let role: String = row.get("role");
            let action: String = row.get("action");
            AclInput {
                allow: true,
                action,
                role,
            }
        }).await.map_err(Into::into)
    }
}

impl From<EventTrack> for Track {
    fn from(src: EventTrack) -> Self {
        Self {
            uri: src.uri,
            flavor: src.flavor,
            mimetype: src.mimetype,
            resolution: src.resolution,
            is_master: src.is_master,
        }
    }
}

impl From<EventCaption> for Caption {
    fn from(src: EventCaption) -> Self {
        Self {
            uri: src.uri,
            lang: src.lang,
        }
    }
}

impl From<EventSegment> for Segment {
    fn from(src: EventSegment) -> Self {
        Self {
            uri: src.uri,
            start_time: src.start_time as f64,
        }
    }
}

#[graphql_object(name = "EventConnection", context = Context)]
impl Connection<AuthorizedEvent> {
    fn page_info(&self) -> &PageInfo {
        &self.page_info
    }
    fn items(&self) -> &[AuthorizedEvent] {
        &self.items
    }
    fn total_count(&self) -> i32 {
        self.total_count
    }
}

define_sort_column_and_order!(
    pub enum VideosSortColumn {
        Title    => "events.title",
        #[default]
        Created  => "created",
        Updated  => "updated",
        Series   => "series.title",
    };
    pub struct VideosSortOrder
);


#[derive(Debug, GraphQLInputObject)]
pub(crate) struct NewEvent {
    opencast_id: String,
    title: String,
    description: Option<String>,
    series_id: Option<Id>,
    creators: Vec<String>,
    acl: Vec<AclInputEntry>,
}

#[derive(GraphQLEnum, PartialEq)]
pub(crate) enum WorkflowStatus {
    Busy,
    Idle,
    Unobtainable,
}
