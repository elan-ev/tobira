//! Definition of the GraphQL API.

use self::{
    mutation::Mutation,
    query::Query,
    subscription::Subscription,
};

pub(crate) mod mutation;
pub(crate) mod query;
pub(crate) mod subscription;
pub(crate) mod util;

mod common;
mod context;
mod err;
mod id;
mod model;

pub(crate) use self::{
    id::Id,
    context::Context,
    common::{Cursor, Node, NodeValue},
};


/// Creates and returns the API root node.
pub(crate) fn root_node() -> RootNode {
    RootNode::new(Query, Mutation, Subscription::new())
}

/// Type of our API root node.
pub(crate) type RootNode = juniper::RootNode<'static, Query, Mutation, Subscription>;
