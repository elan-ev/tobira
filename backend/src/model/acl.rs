use juniper::GraphQLInputObject;
use serde::Serialize;


/// A role being granted permission to perform certain actions.
#[derive(Debug, GraphQLInputObject, Serialize)]
pub struct AclItem {
    pub role: String,
    pub actions: Vec<String>,
}
