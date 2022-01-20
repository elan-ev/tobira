use futures::StreamExt;
use pin_utils::pin_mut;
use juniper::{GraphQLInputObject, GraphQLObject, Nullable};

use crate::{api::{Context, Id, err::{ApiResult, invalid_input}}, dbargs};
use crate::db::types::Key;
use super::{BlockValue, VideoListLayout, VideoListOrder, super::realm::Realm};


impl BlockValue {
    pub(crate) async fn add_text(
        realm: Id,
        index: i32,
        block: NewTextBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        context.require_moderator()?;

        let index = index as i16;

        let realm = realm.key_for(Id::REALM_KIND)
            .ok_or_else(|| invalid_input!("`realm` does not refer to a realm"))?;

        Self::make_room_for_block(realm, index, context).await?;

        context.db
            .execute(
                "insert into blocks (realm_id, index, type, title, text_content)
                    values ($1, $2, 'text', $3, $4)",
                &[&realm, &index, &block.title, &block.content],
            )
            .await?;

        Realm::load_by_key(realm, context)
            .await?
            .ok_or_else(|| invalid_input!("`realm` does not refer to a valid realm"))
    }

    pub(crate) async fn add_series(
        realm: Id,
        index: i32,
        block: NewSeriesBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        context.require_moderator()?;

        let index = index as i16;

        let realm = realm.key_for(Id::REALM_KIND)
            .ok_or_else(|| invalid_input!("`realm` does not refer to a realm"))?;

        Self::make_room_for_block(realm, index, context).await?;

        context.db
            .execute(
                "insert into blocks
                    (realm_id, index, type, title, series_id, videolist_order, videolist_layout)
                    values ($1, $2, 'series', $3, $4, $5, $6)",
                &[
                    &realm,
                    &index,
                    &block.title,
                    &block.series.key_for(Id::SERIES_KIND)
                        .ok_or_else(|| invalid_input!("`block.series` does not refer to a series"))?,
                    &block.order,
                    &block.layout,
                ],
            )
            .await?;

        Realm::load_by_key(realm, context)
            .await?
            .ok_or_else(|| invalid_input!("`realm` does not refer to a valid realm"))
    }

    async fn make_room_for_block(realm: Key, index: i16, context: &Context) -> ApiResult<()> {
        let num_blocks: i64 = context.db
            .query_one(
                "select count(*) from blocks where realm_id = $1",
                &[&realm],
            )
            .await?
            .get(0);

        if index < 0 || index as i64 > num_blocks {
            return Err(invalid_input!("`index` out of range"));
        }

        context.db
            .execute(
                "update blocks
                    set index = index + 1
                    where realm_id = $1
                    and index >= $2",
                &[&realm, &index],
            )
            .await?;

        Ok(())
    }

    pub(crate) async fn swap_by_id(id_1: Id, id_2: Id, context: &Context) -> ApiResult<Realm> {
        let realm_stream = context.db(context.require_moderator()?)
            .query_raw(
                &format!(
                    "update blocks as blocks1 \
                        set index = blocks2.index \
                        from realms, blocks as blocks2 \
                        where blocks1.realm_id = realms.id and blocks2.realm_id = realms.id \
                        and ( \
                            blocks1.id = $1 and blocks2.id = $2 \
                            or blocks1.id = $2 and blocks2.id = $1 \
                        ) \
                        returning {}",
                    Realm::col_names("realms")
                ),
                &[
                    &id_1.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id1` does not refer to a block"))?,
                    &id_2.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id2` does not refer to a block"))?
                ],
            )
            .await?;

        pin_mut!(realm_stream);

        let realm = realm_stream
            .next()
            .await
            .ok_or_else(|| invalid_input!(
                "`id1` and/or `id2` are either not valid blocks, or they are from different realms."
            ))?
            .map(Realm::from_row)?;

        Ok(realm)
    }

    pub(crate) async fn swap_by_index(
        realm: Id,
        index_1: i32,
        index_2: i32,
        context: &Context
    ) -> ApiResult<Realm> {

        if index_1 == index_2 {
            return Realm::load_by_id(realm, context)
                .await?
                .ok_or_else(|| invalid_input!("`realm` is not a valid realm"));
        }

        let realm_stream = context.db(context.require_moderator()?)
            .query_raw(
                &format!(
                    "update blocks \
                        set index = updates.new_index \
                        from realms, (values \
                            ($1::smallint, $2::smallint), \
                            ($2::smallint, $1::smallint) \
                        ) as updates(old_index, new_index), ( \
                            select count(*) as count from blocks \
                            where realm_id = $3 \
                        ) as count \
                        where realm_id = realms.id \
                        and realm_id = $3 \
                        and blocks.index = updates.old_index \
                        and updates.new_index < count \
                        and updates.new_index >= 0 \
                        returning {}",
                    Realm::col_names("realms"),
                ),
                dbargs![
                    &(index_1 as i16),
                    &(index_2 as i16),
                    &realm.key_for(Id::REALM_KIND)
                        .ok_or_else(|| invalid_input!("`realm` is not a valid realm id"))?,
                ],
            )
            .await?
            // We will get the realm twice for two updated rows
            // if everything goes according to plan.
            // If we skip the first and can successfully grab the second,
            // we know it did.
            .skip(1);

        pin_mut!(realm_stream);

        let realm = realm_stream
            .next()
            .await
            .ok_or_else(|| invalid_input!(
                "`index1`, `index2` or `realm` wasn't a valid block index or realm"
            ))?
            .map(Realm::from_row)?;

        Ok(realm)
    }

    pub(crate) async fn update(id: Id, set: UpdateBlock, context: &Context) -> ApiResult<BlockValue> {
        let updated_block = context.db(context.require_moderator()?)
            .query_one(
                &format!(
                    "update blocks set \
                        title = case $2::boolean when true then $3 else title end \
                        where id = $1 \
                        returning {}",
                    Self::COL_NAMES,
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?,
                    &!set.title.is_implicit_null(),
                    &set.title.some(),
                ],
            )
            .await?;

        Ok(Self::from_row(updated_block)?)
    }

    pub(crate) async fn update_text(id: Id, set: UpdateTextBlock, context: &Context) -> ApiResult<BlockValue> {
        let updated_block = context.db(context.require_moderator()?)
            .query_one(
                &format!(
                    "update blocks set \
                        title = case $2::boolean when true then $3 else title end, \
                        text_content = coalesce($4, title) \
                        where id = $1 \
                        and type = 'text' \
                        returning {}",
                    Self::COL_NAMES,
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?,
                    &!set.title.is_implicit_null(),
                    &set.title.some(),
                    &set.content,
                ],
            )
            .await?;

        Ok(Self::from_row(updated_block)?)
    }

    pub(crate) async fn update_series(id: Id, set: UpdateSeriesBlock, context: &Context) -> ApiResult<BlockValue> {
        let updated_block = context.db(context.require_moderator()?)
            .query_one(
                &format!(
                    "update blocks set \
                        title = case $2::boolean when true then $3 else title end, \
                        series_id = coalesce($4, series_id), \
                        videolist_layout = coalesce($5, videolist_layout), \
                        videolist_order = coalesce($6, videolist_order) \
                        where id = $1 \
                        and type = 'series' \
                        returning {}",
                    Self::COL_NAMES,
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?,
                    &!set.title.is_implicit_null(),
                    &set.title.some(),
                    &set.series.map(
                        |series| series.key_for(Id::SERIES_KIND)
                            .ok_or_else(|| invalid_input!("`set.series` does not refer to a series"))
                    ).transpose()?,
                    &set.layout,
                    &set.order,
                ],
            )
            .await?;

        Ok(Self::from_row(updated_block)?)
    }

    pub(crate) async fn remove(id: Id, context: &Context) -> ApiResult<RemovedBlock> {
        let db = context.db(context.require_moderator()?);

        let result = db
            .query_one(
                &format!(
                    "delete from blocks \
                        using realms \
                        where blocks.realm_id = realms.id \
                        and blocks.id = $1 \
                        returning {}, blocks.index",
                    Realm::col_names("realms")
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?
                ],
            )
            .await?;

        let realm_key: Key = result.get(0);
        let index: i16 = result.get(result.len() - 1);
        let realm = Realm::from_row(result);

        // Fix indices after removed block
        db
            .execute(
                "update blocks
                    set index = index - 1
                    where realm_id = $1
                    and index > $2",
                &[&realm_key, &index],
            )
            .await?;

        Ok(RemovedBlock { id, realm })
    }
}


#[derive(GraphQLInputObject)]
pub(crate) struct NewTextBlock {
    title: Option<String>,
    content: String,
}

#[derive(GraphQLInputObject)]
pub(crate) struct NewSeriesBlock {
    title: Option<String>,
    series: Id,
    layout: VideoListLayout,
    order: VideoListOrder,
}


#[derive(GraphQLInputObject)]
pub(crate) struct UpdateBlock {
    title: Nullable<String>,
}

#[derive(GraphQLInputObject)]
pub(crate) struct UpdateTextBlock {
    title: Nullable<String>,
    content: Option<String>,
}

#[derive(GraphQLInputObject)]
pub(crate) struct UpdateSeriesBlock {
    title: Nullable<String>,
    series: Option<Id>,
    layout: Option<VideoListLayout>,
    order: Option<VideoListOrder>,
}


#[derive(GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct RemovedBlock {
    id: Id,
    realm: Realm,
}
