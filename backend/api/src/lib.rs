//! Definition of the GraphQL API.

use crate::{
    mutation::Mutation,
    query::Query,
    subscription::Subscription,
};

pub mod db;
pub mod mutation;
pub mod query;
pub mod subscription;

mod model;
mod id;
mod tx;

pub(crate) use id::{Id, Key};
pub use tx::Transaction;


/// Creates and returns the API root node.
pub fn root_node() -> RootNode {
    RootNode::new(Query, Mutation, Subscription::new())
}

/// Type of our API root node.
pub type RootNode = juniper::RootNode<'static, Query, Mutation, Subscription>;


/// The context that is accessible to every resolver in our API.
pub struct Context {
    pub db: tx::Transaction,
}

impl Context {
    pub fn new(db: Transaction) -> Self {
        Self { db }
    }
}

impl juniper::Context for Context {}
