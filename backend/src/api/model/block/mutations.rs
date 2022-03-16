use futures::StreamExt;
use pin_utils::pin_mut;
use juniper::{GraphQLInputObject, GraphQLObject};

use crate::{api::{Context, Id, err::{ApiResult, invalid_input}}, dbargs};
use crate::db::types::Key;
use super::{BlockValue, VideoListLayout, VideoListOrder, super::realm::Realm};


impl BlockValue {
    pub(crate) async fn add_title(
        realm: Id,
        index: i32,
        block: NewTitleBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        context.require_moderator()?;

        let (realm, index) = Self::prepare_realm_for_block(realm, index, context).await?;

        context.db
            .execute(
                "insert into blocks (realm_id, index, type, text_content) \
                    values ($1, $2, 'title', $3)",
                &[&realm, &index, &block.content],
            )
            .await?;

        Realm::load_by_key(realm, context)
            .await?
            .ok_or_else(|| invalid_input!("`realm` does not refer to a valid realm"))
    }

    pub(crate) async fn add_text(
        realm: Id,
        index: i32,
        block: NewTextBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        context.require_moderator()?;

        let (realm, index) = Self::prepare_realm_for_block(realm, index, context).await?;

        context.db
            .execute(
                "insert into blocks (realm_id, index, type, text_content) \
                    values ($1, $2, 'text', $3)",
                &[&realm, &index, &block.content],
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

        let (realm, index) = Self::prepare_realm_for_block(realm, index, context).await?;

        let series = block.series.key_for(Id::SERIES_KIND)
            .ok_or_else(|| invalid_input!("`block.series` does not refer to a series"))?;

        context.db
            .execute(
                "insert into blocks \
                    (realm_id, index, type, series_id, videolist_order, videolist_layout, show_title) \
                    values ($1, $2, 'series', $3, $4, $5, $6)",
                &[&realm, &index, &series, &block.order, &block.layout, &block.show_title],
            )
            .await?;

        Realm::load_by_key(realm, context)
            .await?
            .ok_or_else(|| invalid_input!("`realm` does not refer to a valid realm"))
    }

    pub(crate) async fn add_video(
        realm: Id,
        index: i32,
        block: NewVideoBlock,
        context: &Context,
    ) -> ApiResult<Realm> {
        context.require_moderator()?;

        let (realm, index) = Self::prepare_realm_for_block(realm, index, context).await?;

        let event = block.event.key_for(Id::EVENT_KIND)
            .ok_or_else(|| invalid_input!("`block.event` does not refer to an event"))?;

        context.db
            .execute(
                "insert into blocks (realm_id, index, type, video_id, show_title) \
                    values ($1, $2, 'video', $3, $4)",
                &[&realm, &index, &event, &block.show_title],
            )
            .await?;

        Realm::load_by_key(realm, context)
            .await?
            .ok_or_else(|| invalid_input!("`realm` does not refer to a valid realm"))
    }

    /// For all blocks in `realm` with an index `>= index`,
    /// increase their index by `1`.
    /// This basically moves all the blocks after the `index`-th one aside,
    /// so a new block can be inserted at position `index`.
    /// It also checks the validity of the given index within the given realm,
    /// and the validity of the realm ID, and returns the validated values
    async fn prepare_realm_for_block(
        realm: Id,
        index: i32,
        context: &Context,
    ) -> ApiResult<(Key, i16)> {
        let realm = realm.key_for(Id::REALM_KIND)
            .ok_or_else(|| invalid_input!("`realm` does not refer to a realm"))?;

        let num_blocks: i64 = context.db
            .query_one(
                "select count(*) from blocks where realm_id = $1",
                &[&realm],
            )
            .await?
            .get(0);

        let index = i16::try_from(index)
            .map_err(|_| invalid_input!("`index` is too large"))?;

        if index < 0 || index as i64 > num_blocks {
            return Err(invalid_input!("`index` out of bounds"));
        }

        context.db
            .execute(
                "update blocks \
                    set index = index + 1 \
                    where realm_id = $1 \
                    and index >= $2",
                &[&realm, &index],
            )
            .await?;

        Ok((realm, index))
    }

    pub(crate) async fn swap_by_index(
        realm: Id,
        index_a: i32,
        index_b: i32,
        context: &Context,
    ) -> ApiResult<Realm> {

        if index_a == index_b {
            return Realm::load_by_id(realm, context)
                .await?
                .ok_or_else(|| invalid_input!("`realm` is not a valid realm"));
        }

        let realm_stream = context.db(context.require_moderator()?)
            .query_raw(
                &format!(
                    // This query is a bit involved, but this allows us to do the full swap in one
                    // go, including "bound checking".
                    //
                    // The query basically joins the tables `blocks`, `realms` and two temporary
                    // tables. The first temporary contains two rows with the
                    // `(old_index, new_index)` and `(new_index, old_index)` pairs. The second only
                    // contains the number of blocks for that realm. The join conditions are
                    // `realm_id = realms.id` and `blocks.index = updates.old_index`, meaning that
                    // the resulting joined table should contain exactly two rows if both indices
                    // are valid. For these two rows, the `update` is performed.
                    //
                    // `updates.new_index < count` and `updates.new_index >= 0` are only to make
                    // sure the new index is in bounds.
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
                    &(i16::try_from(index_a)
                        .map_err(|_| invalid_input!("`indexA` is not a valid block index"))?),
                    &(i16::try_from(index_b)
                        .map_err(|_| invalid_input!("`indexB` is not a valid block index"))?),
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
                "`indexA`, `indexB` or `realm` wasn't a valid block index or realm"
            ))?
            .map(Realm::from_row)?;

        Ok(realm)
    }

    pub(crate) async fn update_title(
        id: Id,
        set: UpdateTitleBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        let updated_block = context.db(context.require_moderator()?)
            .query_one(
                &format!(
                    "update blocks set \
                        text_content = coalesce($2, text_content) \
                        where id = $1 \
                        and type = 'title' \
                        returning {}",
                    Self::COL_NAMES,
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?,
                    &set.content,
                ],
            )
            .await?;

        Ok(Self::from_row(updated_block)?)
    }

    pub(crate) async fn update_text(
        id: Id,
        set: UpdateTextBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        let updated_block = context.db(context.require_moderator()?)
            .query_one(
                &format!(
                    "update blocks set \
                        text_content = coalesce($2, text_content) \
                        where id = $1 \
                        and type = 'text' \
                        returning {}",
                    Self::COL_NAMES,
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?,
                    &set.content,
                ],
            )
            .await?;

        Ok(Self::from_row(updated_block)?)
    }

    pub(crate) async fn update_series(
        id: Id,
        set: UpdateSeriesBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        let updated_block = context.db(context.require_moderator()?)
            .query_one(
                &format!(
                    "update blocks set \
                        series_id = coalesce($2, series_id), \
                        videolist_layout = coalesce($3, videolist_layout), \
                        videolist_order = coalesce($4, videolist_order), \
                        show_title = coalesce($5, show_title) \
                        where id = $1 \
                        and type = 'series' \
                        returning {}",
                    Self::COL_NAMES,
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?,
                    &set.series.map(
                        |series| series.key_for(Id::SERIES_KIND)
                            .ok_or_else(|| invalid_input!("`set.series` does not refer to a series"))
                    ).transpose()?,
                    &set.layout,
                    &set.order,
                    &set.show_title,
                ],
            )
            .await?;

        Ok(Self::from_row(updated_block)?)
    }

    pub(crate) async fn update_video(
        id: Id,
        set: UpdateVideoBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        let updated_block = context.db(context.require_moderator()?)
            .query_one(
                &format!(
                    "update blocks set \
                        video_id = coalesce($2, video_id), \
                        show_title = coalesce($3, show_title) \
                        where id = $1 \
                        and type = 'video' \
                        returning {}",
                    Self::COL_NAMES,
                ),
                &[
                    &id.key_for(Id::BLOCK_KIND)
                        .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?,
                    &set.event.map(
                        |series| series.key_for(Id::EVENT_KIND)
                            .ok_or_else(|| invalid_input!("`set.event` does not refer to a event"))
                    ).transpose()?,
                    &set.show_title,
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

        let index: i16 = result.get(result.len() - 1);
        let realm = Realm::from_row(result);

        // Fix indices after removed block
        db
            .execute(
                "update blocks \
                    set index = index - 1 \
                    where realm_id = $1 \
                    and index > $2",
                &[&realm.key, &index],
            )
            .await?;

        Ok(RemovedBlock { id, realm })
    }
}


#[derive(GraphQLInputObject)]
pub(crate) struct NewTitleBlock {
    content: String,
}

#[derive(GraphQLInputObject)]
pub(crate) struct NewTextBlock {
    content: String,
}

#[derive(GraphQLInputObject)]
pub(crate) struct NewSeriesBlock {
    series: Id,
    show_title: bool,
    layout: VideoListLayout,
    order: VideoListOrder,
}

#[derive(GraphQLInputObject)]
pub(crate) struct NewVideoBlock {
    event: Id,
    show_title: bool,
}


#[derive(GraphQLInputObject)]
pub(crate) struct UpdateTitleBlock {
    content: Option<String>,
}

#[derive(GraphQLInputObject)]
pub(crate) struct UpdateTextBlock {
    content: Option<String>,
}

#[derive(GraphQLInputObject)]
pub(crate) struct UpdateSeriesBlock {
    series: Option<Id>,
    show_title: Option<bool>,
    layout: Option<VideoListLayout>,
    order: Option<VideoListOrder>,
}

#[derive(GraphQLInputObject)]
pub(crate) struct UpdateVideoBlock {
    event: Option<Id>,
    show_title: Option<bool>,
}


#[derive(GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct RemovedBlock {
    id: Id,
    realm: Realm,
}
