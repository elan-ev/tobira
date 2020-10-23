use juniper::graphql_object;

use crate::{
    Context, Id,
    realms::Realm,
};


/// The root query object.
pub struct Query;

#[graphql_object(Context = Context)]
impl Query {
    fn apiVersion() -> &str {
        "0.0"
    }

    /// Returns a flat list of all realms.
    async fn realms(context: &Context) -> Vec<&Realm> {
        context.realm_tree.realms.values().collect()
    }

    /// Returns the realm with the specific ID or `None` if the ID does not
    /// refer to a realm.
    async fn realm(id: Id, context: &Context) -> Option<&Realm> {
        context.realm_tree.get_node(&id)
    }

    /// Returns the root realm.
    async fn root_realm(context: &Context) -> &Realm {
        context.realm_tree.root()
    }
}
