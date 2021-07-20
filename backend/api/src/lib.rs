//! Definition of the GraphQL API.

use tobira_util::prelude::*;
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
mod util;

pub(crate) use id::{Id, Key};
pub use tx::Transaction;


/// Creates and returns the API root node.
pub fn root_node() -> RootNode {
    RootNode::new(Query, Mutation::new(), Subscription::new())
}

/// Type of our API root node.
pub type RootNode = juniper::RootNode<'static, Query, Mutation, Subscription>;


/// The context that is accessible to every resolver in our API.
pub struct Context {
    db: tx::Transaction,
    realm_tree: model::realm::Tree,
}

impl Context {
    pub async fn new(db: Transaction) -> Result<Self> {
        let realm_tree = model::realm::Tree::load(&**db).await?;
        Ok(Self {
            db,
            realm_tree,
        })
    }
}

impl juniper::Context for Context {}
