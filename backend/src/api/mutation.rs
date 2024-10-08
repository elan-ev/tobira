use juniper::graphql_object;

use crate::api::model::event::RemovedEvent;
use super::{
    Context,
    err::ApiResult,
    id::Id,
    model::{
        series::{Series, NewSeries},
        realm::{
            ChildIndex,
            NewRealm,
            Realm,
            RealmOrder,
            RemovedRealm,
            UpdatedPermissions,
            UpdatedRealmName,
            UpdateRealm,
            RealmSpecifier,
            RealmLineageComponent,
            CreateRealmLineageOutcome,
            RemoveMountedSeriesOutcome,
        },
        block::{
            BlockValue,
            NewTitleBlock,
            NewTextBlock,
            NewSeriesBlock,
            NewPlaylistBlock,
            NewVideoBlock,
            UpdateTitleBlock,
            UpdateTextBlock,
            UpdateSeriesBlock,
            UpdatePlaylistBlock,
            UpdateVideoBlock,
            RemovedBlock,
        },
        event::AuthorizedEvent,
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

    /// Creates the current users realm. Errors if it already exists.
    async fn create_my_user_realm(context: &Context) -> ApiResult<Realm> {
        Realm::create_user_realm(context).await
    }

    /// Deletes the given event. Meaning: a deletion request is sent to Opencast, the event
    /// is marked as "deletion pending" in Tobira, and fully removed once Opencast
    /// finished deleting the event.
    /// 
    /// Returns the deletion timestamp in case of success and errors otherwise.
    /// Note that "success" in this case only means the request was successfully sent
    /// and accepted, not that the deletion itself succeeded, which is instead checked
    /// in subsequent harvesting results.
    async fn delete_video(id: Id, context: &Context) -> ApiResult<RemovedEvent> {
        AuthorizedEvent::delete(id, context).await
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

    /// Changes the name of a realm.
    async fn rename_realm(id: Id, name: UpdatedRealmName, context: &Context) -> ApiResult<Realm> {
        Realm::rename(id, name, context).await
    }

    /// Changes the moderator and/or admin roles of a realm.
    async fn update_permissions(id: Id, permissions: UpdatedPermissions, context: &Context) -> ApiResult<Realm> {
        Realm::update_permissions(id, permissions, context).await
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

    /// Adds a playlist block to a realm.
    ///
    /// See `addTitleBlock` for more details.
    async fn add_playlist_block(
        realm: Id,
        index: i32,
        block: NewPlaylistBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        BlockValue::add_playlist(realm, index, block, context).await
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

    /// Update a playlist block's data.
    async fn update_playlist_block(
        id: Id,
        set: UpdatePlaylistBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        BlockValue::update_playlist(id, set, context).await
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

    /// Basically `mkdir -p` for realms: makes sure the given realm lineage
    /// exists, creating the missing realms. Existing realms are *not* updated.
    /// Each realm in the given list is the sub-realm of the previous item in
    /// the list. The first item is sub-realm of the root realm.
    async fn create_realm_lineage(
        realms: Vec<RealmLineageComponent>,
        context: &Context,
    ) -> ApiResult<CreateRealmLineageOutcome> {
        Realm::create_lineage(realms, context).await
    }

    /// Stores series information in Tobira's DB, so it can be mounted without having to be harvested first.
    async fn announce_series(series: NewSeries, context: &Context) -> ApiResult<Series> {
        Series::announce(series, context).await
    }

    /// Adds a series block to an empty realm and makes that realm derive its name from said series.
    async fn add_series_mount_point(
        series_oc_id: String,
        target_path: String,
        context: &Context,
    ) -> ApiResult<Realm> {
        Series::add_mount_point(series_oc_id, target_path, context).await
    }

    /// Removes the series block of given series from the given realm.
    /// If the realm has sub-realms and used to derive its name from the block,
    /// it is renamed to its path segment. If the realm has no sub-realms,
    /// it is removed completely.
    /// Errors if the given realm does not have exactly one series block referring to the
    /// specified series. 
    async fn remove_series_mount_point(
        series_oc_id: String,
        path: String,
        context: &Context,
    ) -> ApiResult<RemoveMountedSeriesOutcome> {
        Series::remove_mount_point(series_oc_id, path, context).await
    }

    /// Atomically mount a series into an (empty) realm.
    /// Creates all the necessary realms on the path to the target
    /// and adds a block with the given series at the leaf.
    async fn mount_series(
        series: NewSeries,
        parent_realm_path: String,
        #[graphql(default = vec![])]
        new_realms: Vec<RealmSpecifier>,
        context: &Context,
    ) -> ApiResult<Realm> {
        Series::mount(series, parent_realm_path, new_realms, context).await
    }
}
