//! Definition of the GraphQL API.

use deadpool::managed::Object;
use deadpool_postgres::ClientWrapper;

use tobira_util::prelude::*;
use crate::{
    mutation::Mutation,
    query::Query,
    subscription::Subscription,
};

pub mod mutation;
pub mod query;
pub mod subscription;

mod model;
mod id;
mod util;

pub(crate) use id::{Id, Key};


/// Creates and returns the API root node.
pub fn root_node() -> RootNode {
    RootNode::new(Query, Mutation::new(), Subscription::new())
}

/// Type of our API root node.
pub type RootNode = juniper::RootNode<'static, Query, Mutation, Subscription>;


// TODO I don't like the specificity of this type ...
pub type DbConnection = Object<ClientWrapper, tokio_postgres::error::Error>;

/// The context that is accessible to every resolver in our API.
pub struct Context {
    db: DbConnection,
    realm_tree: model::realm::Tree,
}

impl Context {
    pub async fn new(db: DbConnection) -> Result<Self> {
        let realm_tree = model::realm::Tree::load(&db).await?;
        Ok(Self {
            db,
            realm_tree,
        })
    }
}

impl juniper::Context for Context {}
