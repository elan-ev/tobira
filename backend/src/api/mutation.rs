use juniper::graphql_object;

use super::{
    Context,
    err::{ApiResult, invalid_input},
    id::Id,
    model::{
        realm::{ChildIndex, NewRealm, Realm, RealmOrder, RemovedRealm, UpdateRealm, RealmSpecifier},
        series::Series,
        block::{
            BlockValue,
            NewTitleBlock,
            NewTextBlock,
            NewSeriesBlock,
            NewVideoBlock,
            UpdateTitleBlock,
            UpdateTextBlock,
            UpdateSeriesBlock,
            UpdateVideoBlock,
            RemovedBlock,
            VideoListOrder,
        },
    },
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

    /// Adds a title block to a realm.
    ///
    /// The new block will be inserted at the given index,
    /// i.e. it will be at that position after the insert.
    /// Or, if you prefer to think about it this way:
    /// It will be inserted before the block that currently sits
    /// at that index.
    async fn add_title_block(
        realm: Id,
        index: i32,
        block: NewTitleBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        BlockValue::add_title(realm, index, block, context).await
    }

    /// Adds a text block to a realm.
    ///
    /// See `addTitleBlock` for more details.
    async fn add_text_block(
        realm: Id,
        index: i32,
        block: NewTextBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        BlockValue::add_text(realm, index, block, context).await
    }

    /// Adds a series block to a realm.
    ///
    /// See `addTitleBlock` for more details.
    async fn add_series_block(
        realm: Id,
        index: i32,
        block: NewSeriesBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        BlockValue::add_series(realm, index, block, context).await
    }

    /// Adds a video block to a realm.
    ///
    /// See `addTitleBlock` for more details.
    async fn add_video_block(
        realm: Id,
        index: i32,
        block: NewVideoBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        BlockValue::add_video(realm, index, block, context).await
    }

    /// Swap two blocks.
    async fn swap_blocks_by_index(
        realm: Id,
        index_a: i32,
        index_b: i32,
        context: &Context,
    ) -> ApiResult<Realm> {
        BlockValue::swap_by_index(realm, index_a, index_b, context).await
    }

    /// Update a title block's data.
    async fn update_title_block(
        id: Id,
        set: UpdateTitleBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        BlockValue::update_title(id, set, context).await
    }

    /// Update a text block's data.
    async fn update_text_block(
        id: Id,
        set: UpdateTextBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        BlockValue::update_text(id, set, context).await
    }

    /// Update a series block's data.
    async fn update_series_block(
        id: Id,
        set: UpdateSeriesBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        BlockValue::update_series(id, set, context).await
    }

    /// Update a video block's data.
    async fn update_video_block(
        id: Id,
        set: UpdateVideoBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        BlockValue::update_video(id, set, context).await
    }

    /// Remove a block from a realm.
    async fn remove_block(id: Id, context: &Context) -> ApiResult<RemovedBlock> {
        BlockValue::remove(id, context).await
    }

    /// Atomically mount a series into an (empty) realm;
    /// Creates all the necessary realms on the path to the target
    /// and adds a block with the given series at the leaf.
    async fn mount_series(
        oc_series_id: String,
        parent_realm_path: String,
        #[graphql(default = vec![])]
        new_realms: Vec<RealmSpecifier>,
        context: &Context
    ) -> ApiResult<Realm> {

        let parent_realm = Realm::load_by_path(parent_realm_path, context)
            .await?
            .ok_or_else(|| invalid_input!("`parentRealmPath` does not refer to a valid realm"))?;

        if new_realms.is_empty() {
            let blocks = BlockValue::load_for_realm(parent_realm.key, context).await?;
            if !blocks.is_empty() {
                return Err(invalid_input!("series can only be mounted in empty realms"));
            }
        }

        let target_realm = {
            let mut target_realm = parent_realm;
            for RealmSpecifier { name, path_segment } in new_realms {
                target_realm = Realm::add(NewRealm {
                    name,
                    path_segment,
                    parent: Id::realm(target_realm.key),
                }, context).await?
            }
            target_realm
        };

        let series = Series::load_by_opencast_id(oc_series_id, context)
            .await?
            .ok_or_else(|| invalid_input!("`oc_series_id` does not refer to a valid Opencast series ID"))?;

        BlockValue::add_series(
            Id::realm(target_realm.key),
            0,
            NewSeriesBlock {
                series: Id::series(series.key),
                show_title: false,
                order: VideoListOrder::NewToOld,
            },
            context,
        ).await
    }
}
