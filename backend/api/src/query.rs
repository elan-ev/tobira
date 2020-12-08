use juniper::graphql_object;

use crate::{
    Context, Id,
    realms::Realm,
};


/// The root query object.
pub struct Query;

#[graphql_object(Context = Context)]
impl Query {
    fn api_version() -> &str {
        "0.0"
    }

    /// Returns a flat list of all realms.
    fn realms(context: &Context) -> Vec<&Realm> {
        context.realm_tree.realms.values().collect()
    }

    /// Returns the realm with the specific ID or `None` if the ID does not
    /// refer to a realm.
    fn realm_by_id(id: Id, context: &Context) -> Option<&Realm> {
        context.realm_tree.get_node(&id)
    }

    /// Returns the realm with the specific path or `None` if the path does not
    /// refer to a realm.
    ///
    /// Every realm has its own "path segment", and the full path of a realm
    /// is just the concatenation of all the path segments between the root realm
    /// and the realm in question, delimited by `"/"`. The root realm is assumed
    /// to have a path segment of `""`, and with the above rule so is its full
    /// path. The path of every other realm will start with `"/"` delimiting the
    /// root realm path segement from the second segment in the path.
    fn realm_by_path(path: String, context: &Context) -> Option<&Realm> {
        context.realm_tree.from_path(&path)
    }

    /// Returns the root realm.
    fn root_realm(context: &Context) -> &Realm {
        context.realm_tree.root()
    }
}
