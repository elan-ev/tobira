use juniper::graphql_object;

use crate::{
    api::{err::map_db_err, model::event::RemovedEvent},
    auth::AuthContext,
};
use super::{
    Context,
    err::{ApiResult, invalid_input, not_authorized},
    id::Id,
    Node,
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
        },
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
            VideoListLayout,
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

    /// Basically `mkdir -p` for realms: makes sure the given realm lineage
    /// exists, creating the missing realms. Existing realms are *not* updated.
    /// Each realm in the given list is the sub-realm of the previous item in
    /// the list. The first item is sub-realm of the root realm.
    async fn create_realm_lineage(
        realms: Vec<RealmLineageComponent>,
        context: &Context,
    ) -> ApiResult<CreateRealmLineageOutcome> {
        if context.auth != AuthContext::TrustedExternal {
            return Err(not_authorized!("only trusted external applications can use this mutation"));
        }

        if realms.len() == 0 {
            return Ok(CreateRealmLineageOutcome { num_created: 0 });
        }

        if context.config.general.reserved_paths().any(|r| realms[0].path_segment == r) {
            return Err(invalid_input!(key = "realm.path-is-reserved", "path is reserved and cannot be used"));
        }

        let mut parent_path = String::new();
        let mut num_created = 0;
        for realm in realms {
            let sql = "\
                insert into realms (parent, name, path_segment) \
                values ((select id from realms where full_path = $1), $2, $3) \
                on conflict do nothing";
            let res = context.db.execute(sql, &[&parent_path, &realm.name, &realm.path_segment])
                .await;
            let affected = map_db_err!(res, {
                if constraint == "valid_path" => invalid_input!("path invalid"),
            })?;
            num_created += affected as i32;

            parent_path.push('/');
            parent_path.push_str(&realm.path_segment);
        }

        Ok(CreateRealmLineageOutcome { num_created })
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
        // Note: This is a rather ad hoc, use-case specific compound mutation.
        // So for the sake of simplicity and being able to change it fast
        // we just reuse all the mutations we already have.
        // Once this code stabilizes, we might want to change that,
        // because doing it like this duplicates some work
        // like checking moderator rights, input validity, etc.

        if context.auth != AuthContext::TrustedExternal {
            return Err(not_authorized!("only trusted external applications can use this mutation"));
        }

        if new_realms.iter().rev().skip(1).any(|r| r.name.is_none()) {
            return Err(invalid_input!("all new realms except the last need to have a name"));
        }

        let parent_realm = Realm::load_by_path(parent_realm_path, context)
            .await?
            .ok_or_else(|| invalid_input!("`parentRealmPath` does not refer to a valid realm"))?;

        if new_realms.is_empty() {
            let blocks = BlockValue::load_for_realm(parent_realm.key, context).await?;
            if !blocks.is_empty() {
                return Err(invalid_input!("series can only be mounted in empty realms"));
            }
        }

        let series = Series::create(series, context).await?;

        let target_realm = {
            let mut target_realm = parent_realm;
            for RealmSpecifier { name, path_segment } in new_realms {
                target_realm = Realm::add(NewRealm {
                    // The `unwrap_or` case is only potentially used for the
                    // last realm, which is renamed below anyway. See the check
                    // above.
                    name: name.unwrap_or_else(|| "temporary-dummy-name".into()),
                    path_segment,
                    parent: Id::realm(target_realm.key),
                }, context).await?
            }
            target_realm
        };

        BlockValue::add_series(
            Id::realm(target_realm.key),
            0,
            NewSeriesBlock {
                series: series.id(),
                show_title: false,
                show_metadata: true,
                order: VideoListOrder::NewToOld,
                layout: VideoListLayout::Gallery,
            },
            context,
        ).await?;

        let block = &BlockValue::load_for_realm(target_realm.key, context).await?[0];

        Realm::rename(
            target_realm.id(),
            UpdatedRealmName::from_block(block.id()),
            context,
        ).await
    }
}
