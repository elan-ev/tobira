use juniper::graphql_object;


use crate::auth::{AuthContext, User};

use super::{
    err::ApiResult,
    jwt::{jwt, JwtService},
    model::{
        event::{AuthorizedEvent, Event},
        known_roles::{self, KnownGroup, KnownUsersSearchOutcome},
        playlist::Playlist,
        realm::Realm,
        search::{
            self,
            EventSearchOutcome,
            Filters,
            SearchOutcome,
            SeriesSearchOutcome,
            PlaylistSearchOutcome
        },
        series::Series,
    },
    Context,
    Id,
    NodeValue,
};


/// The root query object.
pub(crate) struct Query;

#[graphql_object(Context = Context)]
impl Query {
    /// Returns the main root realm.
    async fn root_realm(context: &Context) -> ApiResult<Realm> {
        Realm::root(context).await
    }

    /// Returns the realm with the specific ID or `None` if the ID does not
    /// refer to a realm.
    async fn realm_by_id(id: Id, context: &Context) -> ApiResult<Option<Realm>> {
        Realm::load_by_id(id, context).await
    }

    /// Returns the realm with the given path or `null` if the path does not
    /// refer to a realm.
    ///
    /// Paths with and without trailing slash are accepted and treated equally.
    /// The paths `""` and `"/"` refer to the root realm. All other paths have
    /// to start with `"/"`. Paths starting with `"/@"` are considered user
    /// root realms.
    async fn realm_by_path(path: String, context: &Context) -> ApiResult<Option<Realm>> {
        Realm::load_by_path(path, context).await
    }

    /// Returns an event by its Opencast ID.
    async fn event_by_opencast_id(id: String, context: &Context) -> ApiResult<Option<Event>> {
        AuthorizedEvent::load_by_opencast_id(id, context).await
    }

    /// Returns an event by its ID.
    async fn event_by_id(id: Id, context: &Context) -> ApiResult<Option<Event>> {
        AuthorizedEvent::load_by_id(id, context).await
    }

    /// Returns a series by its Opencast ID.
    async fn series_by_opencast_id(id: String, context: &Context) -> ApiResult<Option<Series>> {
        Series::load_by_opencast_id(id, context).await
    }

    /// Returns a series by its ID.
    async fn series_by_id(id: Id, context: &Context) -> ApiResult<Option<Series>> {
        Series::load_by_id(id, context).await
    }

    /// Returns a playlist by its Opencast ID.
    async fn playlist_by_opencast_id(id: String, context: &Context) -> ApiResult<Option<Playlist>> {
        Playlist::load_by_opencast_id(id, context).await
    }

    /// Returns a playlist by its ID.
    async fn playlist_by_id(id: Id, context: &Context) -> ApiResult<Option<Playlist>> {
        Playlist::load_by_id(id, context).await
    }

    /// Returns the current user.
    fn current_user(context: &Context) -> Option<&User> {
        match &context.auth {
            AuthContext::User(user) => Some(user),
            _ => None,
        }
    }

    /// Returns a new JWT that can be used to authenticate against Opencast for
    /// using the given service. For `service = Editor`, `event` has to be
    /// specified.
    async fn jwt(service: JwtService, event: Option<Id>, context: &Context) -> ApiResult<String> {
        jwt(service, event, context).await
    }

    /// Retrieve a node by globally unique ID. Mostly useful for relay.
    async fn node(id: Id, context: &Context) -> ApiResult<Option<NodeValue>> {
        match id.kind() {
            Id::REALM_KIND => Ok(Realm::load_by_id(id, context).await?.map(NodeValue::from)),
            Id::SERIES_KIND => Ok(Series::load_by_id(id, context).await?.map(NodeValue::from)),
            Id::EVENT_KIND => AuthorizedEvent::load_by_id(id, context).await?
                .map(|e| e.into_result().map(NodeValue::from))
                .transpose(),
            _ => Ok(None),
        }
    }

    /// Returns `null` if the query is too short.
    async fn search(query: String, filters: Filters, context: &Context) -> ApiResult<SearchOutcome> {
        search::perform(&query, filters, context).await
    }

    /// Searches through events. Results include:
    ///
    /// - Events that the user has write access to (listed & unlisted).
    /// - If `writable_only` is false, this also searches through videos that
    ///   the user has preview access to. However, unless the user has the
    ///   privilege to find unlisted events, only listed ones are searched.
    async fn search_all_events(
        query: String,
        writable_only: bool,
        #[graphql(default = false)]
        exclude_series_members: bool,
        #[graphql(default = [])]
        excluded_ids: Vec<String>,
        context: &Context,
    ) -> ApiResult<EventSearchOutcome> {
        search::all_events(
            &query,
            writable_only,
            exclude_series_members,
            &excluded_ids,
            context,
        ).await
    }

    /// Searches through series. Searches through:
    ///
    /// - Series that the user has write access to (listed & unlisted).
    /// - If `writable_only` is false, this also searches through listed series.
    ///   If the user has the privilege to find unlisted series, all series are
    ///   searched.
    async fn search_all_series(
        query: String,
        writable_only: bool,
        context: &Context,
    ) -> ApiResult<SeriesSearchOutcome> {
        search::all_series(&query, writable_only, context).await
    }

    /// Searches through playlists. Results may include:
    ///
    /// - Playlists that the user has write access to (listed & unlisted).
    /// - If `writable_only` is false, this also searches through listed playlists.
    ///   If the user has the privilege to find unlisted playlists, all playlists are
    ///   searched.
    async fn search_all_playlists(
        query: String,
        writable_only: bool,
        context: &Context,
    ) -> ApiResult<PlaylistSearchOutcome> {
        search::all_playlists(&query, writable_only, context).await
    }

    /// Searches through all known users. The behavior of this depends on the
    /// `general.users_searchable` config value. If it is `false`, this returns
    /// only users that have an exact match with the input query. The number of
    /// results is limited to some fixed value.
    async fn search_known_users(
        query: String,
        context: &Context,
    ) -> ApiResult<KnownUsersSearchOutcome> {
        known_roles::search_known_users(query, context).await
    }

    /// Returns all known groups selectable in the ACL UI.
    async fn known_groups(context: &Context) -> ApiResult<Vec<KnownGroup>> {
        KnownGroup::load_all(context).await
    }
}
