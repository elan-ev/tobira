//! Definition of the GraphQL API.

use deadpool_postgres::Pool;

use self::{
    mutation::Mutation,
    query::Query,
    subscription::Subscription,
};

pub mod mutation;
pub mod query;
pub mod subscription;


/// Creates and returns the API root node.
pub fn root_node() -> RootNode {
    RootNode::new(Query, Mutation::new(), Subscription::new())
}

/// Type of our API root node.
pub type RootNode = juniper::RootNode<'static, Query, Mutation, Subscription>;


/// The context that is accessible to every resolver in our API.
pub struct Context {
    pub db: Pool,
}

impl juniper::Context for Context {}
