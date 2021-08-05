use juniper::{FieldResult, graphql_object};

use crate::{
    id::Id,
    model::realm::{ChildIndex, NewRealm, Realm, RealmOrder, RemovedRealm, UpdateRealm},
};
use super::Context;


/// The root mutation object.
pub struct Mutation;

#[graphql_object(Context = Context)]
impl Mutation {
    /// Adds a new realm.
    async fn add_realm(realm: NewRealm, context: &Context) -> FieldResult<Realm> {
        Realm::add(realm, context).await
    }

    /// Sets the order of all children of a specific realm.
    ///
    /// `childIndices` must contain at least one element, i.e. do not call this
    /// for realms without children.
    #[graphql(
        arguments(
            child_indices(default = None),
        )
    )]
    async fn set_child_order(
        parent: Id,
        child_order: RealmOrder,
        child_indices: Option<Vec<ChildIndex>>,
        context: &Context,
    ) -> FieldResult<Realm> {
        Realm::set_child_order(parent, child_order, child_indices, context).await
    }

    /// Updates a realm's data.
    async fn update_realm(id: Id, set: UpdateRealm, context: &Context) -> FieldResult<Realm> {
        Realm::update(id, set, context).await
    }

    async fn remove_realm(id: Id, context: &Context) -> FieldResult<RemovedRealm> {
        Realm::remove(id, context).await
    }
}
