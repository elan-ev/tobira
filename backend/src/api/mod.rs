//! Definition of the GraphQL API.

use crate::{auth::User, db::Transaction};
use self::{
    mutation::Mutation,
    query::Query,
    subscription::Subscription,
};

pub(crate) mod mutation;
pub(crate) mod query;
pub(crate) mod subscription;

mod model;
mod id;

use id::Id;


/// Creates and returns the API root node.
pub(crate) fn root_node() -> RootNode {
    RootNode::new(Query, Mutation, Subscription::new())
}

/// Type of our API root node.
pub(crate) type RootNode = juniper::RootNode<'static, Query, Mutation, Subscription>;


/// The context that is accessible to every resolver in our API.
pub(crate) struct Context {
    pub(crate) db: Transaction,
    pub(crate) user: Option<User>,
}

impl juniper::Context for Context {}
