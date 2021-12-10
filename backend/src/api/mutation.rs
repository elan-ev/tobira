use juniper::graphql_object;

use super::{
    Context,
    err::ApiResult,
    id::Id,
    model::{
        realm::{ChildIndex, NewRealm, Realm, RealmOrder, RemovedRealm, UpdateRealm},
        block::{
            BlockValue,
            UpdateBlock,
            UpdateTextBlock,
            UpdateSeriesBlock,
            RemovedBlock,
        },
    }
};


/// The root mutation object.
pub(crate) struct Mutation;

#[graphql_object(Context = Context)]
impl Mutation {
    /// Adds a new realm.
    async fn add_realm(realm: NewRealm, context: &Context) -> ApiResult<Realm> {
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
    ) -> ApiResult<Realm> {
        Realm::set_child_order(parent, child_order, child_indices, context).await
    }

    /// Updates a realm's data.
    async fn update_realm(id: Id, set: UpdateRealm, context: &Context) -> ApiResult<Realm> {
        Realm::update(id, set, context).await
    }

    /// Remove a realm from the tree.
    async fn remove_realm(id: Id, context: &Context) -> ApiResult<RemovedRealm> {
        Realm::remove(id, context).await
    }

    /// Swap two blocks.
    ///
    /// This is a less flexible but potentially cheaper alternative
    /// to `orderBlocks`.
    async fn swap_blocks_by_id(id_1: Id, id_2: Id, context: &Context) -> ApiResult<Realm> {
        BlockValue::swap_by_id(id_1, id_2, context).await
    }

    /// Swap two blocks.
    ///
    /// This is a less flexible but potentially cheaper alternative
    /// to `orderBlocks`.
    async fn swap_blocks_by_index(
        realm: Id,
        index_1: i32,
        index_2: i32,
        context: &Context
    ) -> ApiResult<Realm> {
        BlockValue::swap_by_index(realm, index_1, index_2, context).await
    }

    /// Update a block's data
    async fn update_block(id: Id, set: UpdateBlock, context: &Context) -> ApiResult<BlockValue> {
        BlockValue::update(id, set, context).await
    }

    /// Update a text block's data
    async fn update_text_block(id: Id, set: UpdateTextBlock, context: &Context) -> ApiResult<BlockValue> {
        BlockValue::update_text(id, set, context).await
    }

    /// Update a series block's data
    async fn update_series_block(id: Id, set: UpdateSeriesBlock, context: &Context) -> ApiResult<BlockValue> {
        BlockValue::update_series(id, set, context).await
    }

    /// Remove a block from a realm.
    async fn remove_block(id: Id, context: &Context) -> ApiResult<RemovedBlock> {
        BlockValue::remove(id, context).await
    }
}
