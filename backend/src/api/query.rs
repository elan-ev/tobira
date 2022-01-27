use juniper::graphql_object;


use crate::auth::User;

use super::{
    Context,
    Id,
    NodeValue,
    err::ApiResult,
    model::{
        realm::Realm,
        event::Event,
        search::{self, SearchResults},
        series::Series,
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
    async fn realm_by_path(path: String, context: &Context) -> ApiResult<Option<Realm>> {
        Realm::load_by_path(path, context).await
    }

    /// Returns an event by its ID.
    async fn event(id: Id, context: &Context) -> ApiResult<Option<Event>> {
        Event::load_by_id(id, context).await
    }

    /// Returns a list of all events the current user has read access to
    async fn events(context: &Context) -> ApiResult<Vec<Event>> {
        Event::load_all(context).await
    }

    /// Returns a list of all series
    async fn series(context: &Context) -> ApiResult<Vec<Series>> {
        Series::load_all(context).await
    }

    /// Returns the current user.
    fn current_user(context: &Context) -> Option<&User> {
        context.user.as_ref()
    }

    /// Returns a new JWT that can be used to authenticate against Opencast for uploading videos.
    fn upload_jwt(context: &Context) -> ApiResult<String> {
        context.require_upload_permission()?;
        match &context.user {
            None => unreachable!("user not logged in, but has upload permissions"),
            Some(data) => Ok(context.jwt.new_upload_token(data)),
        }
    }

    /// Retrieve a node by globally unique ID. Mostly useful for relay.
    async fn node(id: Id, context: &Context) -> ApiResult<Option<NodeValue>> {
        match id.kind() {
            Id::REALM_KIND => Ok(Realm::load_by_id(id, context).await?.map(NodeValue::from)),
            Id::SERIES_KIND => Ok(Series::load_by_id(id, context).await?.map(NodeValue::from)),
            Id::EVENT_KIND => Ok(Event::load_by_id(id, context).await?.map(NodeValue::from)),
            _ => Ok(None),
        }
    }

    /// Returns `null` if the query is too short.
    async fn search(query: String, context: &Context) -> ApiResult<Option<SearchResults>> {
        search::perform(&query, context).await
    }
}
