//! Definition of the GraphQL API.

use deadpool_postgres::Pool;

use tobira_util::prelude::*;
use crate::{
    mutation::Mutation,
    query::Query,
    subscription::Subscription,
};

pub mod mutation;
pub mod query;
pub mod subscription;

mod realms;
mod id;
mod util;

pub(crate) use id::{Id, Key};


/// Creates and returns the API root node.
pub fn root_node() -> RootNode {
    RootNode::new(Query, Mutation::new(), Subscription::new())
}

/// Type of our API root node.
pub type RootNode = juniper::RootNode<'static, Query, Mutation, Subscription>;


/// The context that is accessible to every resolver in our API.
pub struct Context {
    #[allow(dead_code)] // TODO
    db: Pool,
    realm_tree: realms::Tree,
}

impl Context {
    pub async fn new(db: Pool) -> Result<Self> {
        let realm_tree = realms::Tree::from_db(&db).await?;
        Ok(Self {
            db,
            realm_tree,
        })
    }
}

impl juniper::Context for Context {}
