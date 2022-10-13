use juniper::graphql_object;


use crate::auth::{AuthContext, User};

use super::{
    Context,
    Id,
    NodeValue,
    err::ApiResult,
    model::{
        realm::Realm,
        event::{AuthorizedEvent, Event},
        series::Series,
        search::{self, SearchOutcome, EventSearchOutcome},
    },
};


/// The root query object.
pub(crate) struct Query;

#[graphql_object(Context = Context)]
impl Query {
    /// Returns the root realm.
    async fn root_realm(context: &Context) -> ApiResult<Realm> {
        Realm::root(context).await
    }

    /// Returns the realm with the specific ID or `None` if the ID does not
    /// refer to a realm.
    async fn realm_by_id(id: Id, context: &Context) -> ApiResult<Option<Realm>> {
        Realm::load_by_id(id, context).await
    }

    /// Returns the realm with the given path or `None` if the path does not
    /// refer to a realm.
    ///
    /// Paths with and without trailing slash are accepted and treated equally.
    /// The paths `""` and `"/"` refer to the root realm. All other paths have
    /// to start with `"/"`.
    async fn realm_by_path(path: String, context: &Context, test: bool) -> ApiResult<Option<Realm>> {
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

    /// Returns a list of all series.
    async fn all_series(context: &Context) -> ApiResult<Vec<Series>> {
        Series::load_all(context).await
    }

    /// Returns the current user.
    fn current_user(context: &Context) -> Option<&User> {
        match &context.auth {
            AuthContext::User(user) => Some(user),
            _ => None,
        }
    }

    /// Returns a new JWT that can be used to authenticate against Opencast for uploading videos.
    fn upload_jwt(context: &Context) -> ApiResult<String> {
        context.require_upload_permission()?;
        match &context.auth {
            AuthContext::User(data) => Ok(context.jwt.new_upload_token(data)),
            _ => unreachable!("user not logged in, but has upload permissions"),
        }
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
    async fn search(query: String, context: &Context) -> ApiResult<SearchOutcome> {
        search::perform(&query, context).await
    }

    /// Searches through all events (including non-listed ones). Requires
    /// moderator rights.
    async fn search_all_events(query: String, context: &Context) -> ApiResult<EventSearchOutcome> {
        search::all_events(&query, context).await
    }
}
