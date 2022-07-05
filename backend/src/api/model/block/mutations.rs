use futures::StreamExt;
use juniper::{GraphQLInputObject, GraphQLObject};

use crate::{
    api::{Context, Id, err::{ApiResult, invalid_input}, model::realm::REALM_JOINS},
    db::{types::Key, util::select},
    prelude::*,
};
use super::{BlockValue, VideoListOrder, super::realm::Realm};


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
                    (realm_id, index, type, series_id, videolist_order, show_title) \
                    values ($1, $2, 'series', $3, $4, $5)",
                &[&realm, &index, &series, &block.order, &block.show_title],
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

        let db = context.db(context.require_moderator()?);

        // The next query will swap two blocks' indices;
        // during the execution of that statement a moment will exist
        // in which two blocks of a realm have the same index.
        // Since this violates one of our constraints, we defer it.
        db.execute("set constraints index_unique_in_realm deferred", &[]).await?;

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
        let selection = Realm::select();
        let query = format!(
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
                returning {selection}",
        );
        let realm_stream = db
            .query_raw(
                &query,
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

        // TODO Actually reset to whatever it was before, but that needs nested transactions
        db.execute("set constraints index_unique_in_realm immediate", &[]).await?;

        futures::pin_mut!(realm_stream);

        let realm = realm_stream
            .next()
            .await
            .ok_or_else(|| invalid_input!(
                "`indexA`, `indexB` or `realm` wasn't a valid block index or realm"
            ))?
            .map(|row| Realm::from_row_start(&row))?;

        Ok(realm)
    }

    pub(crate) async fn update_title(
        id: Id,
        set: UpdateTitleBlock,
        context: &Context,
    ) -> ApiResult<Self> {
        let selection = Self::select();
        let query = format!(
            "update blocks set \
                text_content = coalesce($2, text_content) \
                where id = $1 \
                and type = 'title' \
                returning {selection}",
        );
        context.db(context.require_moderator()?)
            .query_one(&query, &[&Self::key_for(id)?, &set.content])
            .await?
            .pipe(|row| Ok(Self::from_row_start(&row)))
    }

    pub(crate) async fn update_text(
        id: Id,
        set: UpdateTextBlock,
        context: &Context,
    ) -> ApiResult<Self> {
        let selection = Self::select();
        let query = format!(
            "update blocks set \
                text_content = coalesce($2, text_content) \
                where id = $1 \
                and type = 'text' \
                returning {selection}",
        );
        context.db(context.require_moderator()?)
            .query_one(&query, &[&Self::key_for(id)?, &set.content])
            .await?
            .pipe(|row| Ok(Self::from_row_start(&row)))
    }

    pub(crate) async fn update_series(
        id: Id,
        set: UpdateSeriesBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        let series_id = set.series.map(
            |series| series.key_for(Id::SERIES_KIND)
                .ok_or_else(|| invalid_input!("`set.series` does not refer to a series"))
        ).transpose()?;

        let selection = Self::select();
        let query = format!(
            "update blocks set \
                series_id = coalesce($2, series_id), \
                videolist_order = coalesce($3, videolist_order), \
                show_title = coalesce($4, show_title) \
                where id = $1 \
                and type = 'series' \
                returning {selection}",
        );
        context.db(context.require_moderator()?)
            .query_one(&query, &[&Self::key_for(id)?, &series_id, &set.order, &set.show_title])
            .await?
            .pipe(|row| Ok(Self::from_row_start(&row)))
    }

    pub(crate) async fn update_video(
        id: Id,
        set: UpdateVideoBlock,
        context: &Context,
    ) -> ApiResult<BlockValue> {
        let video_id = set.event.map(
            |series| series.key_for(Id::EVENT_KIND)
                .ok_or_else(|| invalid_input!("`set.event` does not refer to a event"))
        ).transpose()?;

        let selection = Self::select();
        let query = format!(
            "update blocks set \
                video_id = coalesce($2, video_id), \
                show_title = coalesce($3, show_title) \
                where id = $1 \
                and type = 'video' \
                returning {selection}",
        );
        context.db(context.require_moderator()?)
            .query_one(&query, &[&Self::key_for(id)?, &video_id, &set.show_title])
            .await?
            .pipe(|row| Ok(Self::from_row_start(&row)))
    }

    pub(crate) async fn remove(id: Id, context: &Context) -> ApiResult<RemovedBlock> {
        let db = context.db(context.require_moderator()?);
        let block_id = id.key_for(Id::BLOCK_KIND)
            .ok_or_else(|| invalid_input!("`id` does not refer to a block"))?;

        let (selection, mapping) = select!(realm: Realm, index: "(select index from deleted)");
        let query = format!(
            "with deleted as (\
                delete from blocks \
                where id = $1 \
                returning realm_id, index\
            ) \
            select {selection} \
            from realms {REALM_JOINS} \
            where realms.id = (select realm_id from deleted)"
        );
        let result = db
            .query_one(&query, &[&block_id])
            .await?;

        let index: i16 = mapping.index.of(&result);
        let realm = Realm::from_row(&result, mapping.realm);

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

    fn key_for(id: Id) -> ApiResult<Key> {
        id.key_for(Id::BLOCK_KIND)
            .ok_or_else(|| invalid_input!("`id` does not refer to a block"))
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
    pub(crate) series: Id,
    pub(crate) show_title: bool,
    pub(crate) order: VideoListOrder,
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
