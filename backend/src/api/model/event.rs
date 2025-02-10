use std::collections::HashSet;

use chrono::{DateTime, Utc};
use hyper::StatusCode;
use postgres_types::ToSql;
use juniper::{graphql_object, Executor, GraphQLObject, ScalarValue};
use sha1::{Sha1, Digest};

use crate::{
    api::{
        common::NotAllowed,
        err::{self, ApiResult},
        model::{
            acl::{self, Acl},
            realm::Realm,
            series::Series,
        },
        Context,
        Id,
        Node,
        NodeValue,
    },
    db::{
        types::{EventCaption, EventSegment, EventState, EventTrack, Credentials},
        util::{impl_from_db, select},
    },
    model::{Key, ExtraMetadata},
    prelude::*,
};

use self::{acl::AclInputEntry, err::ApiError};

use super::{
    playlist::VideoListEntry,
    shared::{
        load_writable_for_user,
        ItemMapping,
        Connection,
        LoadableItem,
        PageInfo,
        SortOrder,
        VideosSortColumn,
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
    key: Key,
    opencast_id: String,
    title: String,
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

        if context.auth.overlaps_roles(&self.read_roles) || credentials_match {
            self.authorized_data.as_ref()
        } else {
            None
        }
    }

    /// Whether the current user has write access to this event.
    fn can_write(&self, context: &Context) -> bool {
        context.auth.overlaps_roles(&self.write_roles)
    }

    fn tobira_deletion_timestamp(&self) -> &Option<DateTime<Utc>> {
        &self.tobira_deletion_timestamp
    }

    /// Whether the event has active workflows.
    async fn has_active_workflows(&self, context: &Context) -> ApiResult<bool> {
        if !context.auth.overlaps_roles(&self.write_roles) {
            return Err(err::not_authorized!(
                key = "event.workflow.not-allowed",
                "you are not allowed to inquire about this event's workflow activity",
            ));
        }

        let response = context
            .oc_client
            .has_active_workflows(&self.opencast_id)
            .await
            .map_err(|e| {
                error!("Failed to get workflow activity: {}", e);
                err::opencast_error!("API returned unexpected response, event might be unknown")
            })?;

        Ok(response)
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
                    synced_data: None,
                    created: None,
                    updated: None,
                    metadata: None,
                    read_roles: None,
                    write_roles: None,
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
        context.auth.overlaps_roles(&self.preview_roles)
            || context.auth.overlaps_roles(&self.read_roles)
    }

    fn series_key(&self) -> Option<Key> {
        self.series.as_ref().map(|s| s.key)
    }

    async fn load_for_api(
        id: Id,
        context: &Context,
        not_found_error: ApiError,
        not_authorized_error: ApiError,
    ) -> ApiResult<AuthorizedEvent> {
        let event = Self::load_by_id(id, context)
            .await?
            .ok_or_else(|| not_found_error)?
            .into_result()?;

        if !context.auth.overlaps_roles(&event.write_roles) {
            return Err(not_authorized_error);
        }

        Ok(event)
    }

    pub(crate) async fn delete(id: Id, context: &Context) -> ApiResult<RemovedEvent> {
        let event = Self::load_for_api(
            id,
            context,
            err::invalid_input!(
                key = "event.delete.not-found",
                "event not found"
            ),
            err::not_authorized!(
                key = "event.delete.not-allowed",
                "you are not allowed to delete this event",
            )
        ).await?;

        let response = context
            .oc_client
            .delete_event(&event.opencast_id)
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
            Ok(RemovedEvent { id })
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

        info!(event_id = %id, "Requesting ACL update of event");
        let event = Self::load_for_api(
            id,
            context,
            err::invalid_input!(
                key = "event.acl.not-found",
                "event not found",
            ),
            err::not_authorized!(
                key = "event.acl.not-allowed",
                "you are not allowed to update this event's acl",
            )
        ).await?;

        if Self::has_active_workflows(&event, context).await? {
            return Err(err::opencast_error!(
                key = "event.workflow.active",
                "acl change blocked by another workflow",
            ));
        }

        let response = context
            .oc_client
            .update_event_acl(&event.opencast_id, &acl, context)
            .await
            .map_err(|e| {
                error!("Failed to send acl update request: {}", e);
                err::opencast_unavailable!("Failed to send acl update request")
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

            Self::load_by_id(id, context)
                .await?
                .ok_or_else(|| err::invalid_input!(
                    key = "event.acl.not-found",
                    "event not found",
                ))?
                .into_result()
        } else {
            warn!(
                event_id = %id,
                "Failed to update event acl, OC returned status: {}",
                response.status(),
            );
            Err(err::opencast_error!("Opencast API error: {}", response.status()))
        }
    }

    /// Starts a workflow on the event.
    async fn start_workflow(oc_id: &str, workflow_id: &str, context: &Context) -> ApiResult<StatusCode> {
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
    ) -> ApiResult<EventConnection> {
        let conn = load_writable_for_user::<AuthorizedEvent, VideosSortColumn>(
            context, order, offset, limit,
        ).await?;

        Ok(EventConnection { inner: conn })
    }
}

impl LoadableItem for AuthorizedEvent {
    fn selection() -> (String, ItemMapping<<Self as FromDb>::RowMapping>) {
        let (selection, mapping) = select!(resource: AuthorizedEvent);
        (selection, mapping.resource)
    }

    fn table_name() -> &'static str {
        "all_events"
    }

    fn alias() -> Option<&'static str> {
        Some("events")
    }

    fn sort_clauses(_column: &str) -> (&str, &str) {
        ("left join series on series.id = events.series", "")
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

pub(crate) struct EventConnection {
    inner: Connection<AuthorizedEvent>,
}

#[graphql_object(context = Context)]
impl EventConnection {
    fn page_info(&self) -> &PageInfo {
        &self.inner.page_info
    }
    fn items(&self) -> &Vec<AuthorizedEvent> {
        &self.inner.items
    }
    fn total_count(&self) -> i32 {
        self.inner.total_count
    }
}

#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct RemovedEvent {
    id: Id,
}

#[derive(Debug)]
struct AclForDB {
    // todo: add custom and preview roles when sent by frontend
    // preview_roles: Vec<String>,
    read_roles: Vec<String>,
    write_roles: Vec<String>,
    // custom_action_roles: CustomActions,
}

fn convert_acl_input(entries: Vec<AclInputEntry>) -> AclForDB {
    // let mut preview_roles = HashSet::new();
    let mut read_roles = HashSet::new();
    let mut write_roles = HashSet::new();
    // let mut custom_action_roles = CustomActions::default();

    for entry in entries {
        let role = entry.role;
        for action in entry.actions {
            match action.as_str() {
                // "preview" => {
                //     preview_roles.insert(role.clone());
                // }
                "read" => {
                    read_roles.insert(role.clone());
                }
                "write" => {
                    write_roles.insert(role.clone());
                }
                _ => {
                    // custom_action_roles
                    //     .0
                    //     .entry(action)
                    //     .or_insert_with(Vec::new)
                    //     .push(role.clone());
                    todo!();
                }
            };
        }
    }

    AclForDB {
        // todo: add custom and preview roles when sent by frontend
        // preview_roles: preview_roles.into_iter().collect(),
        read_roles: read_roles.into_iter().collect(),
        write_roles: write_roles.into_iter().collect(),
        // custom_action_roles,
    }
}
