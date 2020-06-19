use super::Context;

/// The root query object.
pub struct Query;

#[juniper::graphql_object(Context = Context)]
impl Query {
    fn apiVersion() -> &str {
        "0.0"
    }
}
