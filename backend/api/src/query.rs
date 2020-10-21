use juniper::graphql_object;

use crate::{
    Context, Id,
    realms::{self, Realm}
};


/// The root query object.
pub struct Query;

#[graphql_object(Context = Context)]
impl Query {
    fn apiVersion() -> &str {
        "0.0"
    }

    async fn realms(context: &Context) -> Vec<&Realm> {
        context.realm_tree.realms.values().collect()
    }

    #[graphql(
        arguments(
            id(default = Id::new(realms::KIND_PREFIX, 0))
        )
    )]
    async fn realm(id: Id, context: &Context) -> Option<&Realm> {
        context.realm_tree.get_node(&id)
    }
}
