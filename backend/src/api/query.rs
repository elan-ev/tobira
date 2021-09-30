use juniper::{graphql_object, FieldResult};

use crate::user::User;

use super::{Context, Id, model::{realm::Realm, event::Event}};


/// The root query object.
pub(crate) struct Query;

#[graphql_object(Context = Context)]
impl Query {
    fn api_version() -> &str {
        "0.0"
    }

    /// Returns the root realm.
    async fn root_realm(context: &Context) -> FieldResult<Realm> {
        Realm::root(context).await
    }

    /// Returns the realm with the specific ID or `None` if the ID does not
    /// refer to a realm.
    async fn realm_by_id(id: Id, context: &Context) -> FieldResult<Option<Realm>> {
        Realm::load_by_id(id, context).await
    }

    /// Returns the realm with the given path or `None` if the path does not
    /// refer to a realm.
    ///
    /// Paths with and without trailing slash are accepted and treated equally.
    /// The paths `""` and `"/"` refer to the root realm. All other paths have
    /// to start with `"/"`.
    async fn realm_by_path(path: String, context: &Context) -> FieldResult<Option<Realm>> {
        Realm::load_by_path(path, context).await
    }

    /// Returns an event by its ID.
    async fn event(id: Id, context: &Context) -> FieldResult<Option<Event>> {
        Event::load_by_id(id, context).await
    }

    /// Returns the current user.
    fn current_user(context: &Context) -> Option<&User> {
        context.user.as_ref()
    }
}
