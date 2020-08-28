use juniper::graphql_object;

use super::{Context, realms::{self, Realm}};

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
            id(default = 0)
        )
    )]
    async fn realm(id: realms::Id, context: &Context) -> Option<&Realm> {
        context.realm_tree.get_node(&id)
    }
}
