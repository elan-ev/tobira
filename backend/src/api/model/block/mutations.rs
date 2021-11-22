use futures::StreamExt;
use pin_utils::pin_mut;
use juniper::GraphQLObject;

use crate::{api::{Context, Id, err::{ApiResult, invalid_input}}};
use crate::db::types::Key;
use super::{BlockValue, super::realm::Realm};


impl BlockValue {
    pub(crate) async fn swap_by_id(id_1: Id, id_2: Id, context: &Context) -> ApiResult<Realm> {
        let realm_stream = context.db(context.require_moderator()?)
            .query_raw(
                &format!(
                    "update blocks as blocks1
                        set index = blocks2.index
                        from realms, blocks as blocks2
                        where blocks1.realm_id = realms.id and blocks2.realm_id = realms.id
                        and (
                            blocks1.id = $1 and blocks2.id = $2
                            or blocks1.id = $2 and blocks2.id = $1
                        )
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

    pub(crate) async fn remove(id: Id, context: &Context) -> ApiResult<RemovedBlock> {
        let db = context.db(context.require_moderator()?);

        let result = db
            .query_one(
                &format!("delete from blocks
                    using realms
                    where blocks.realm_id = realms.id
                    and blocks.id = $1
                    returning {}, blocks.index", Realm::col_names("realms")),
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


#[derive(GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct RemovedBlock {
    id: Id,
    realm: Realm,
}
