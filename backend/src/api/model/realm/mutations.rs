use std::collections::{HashMap, HashSet};

use crate::{
    api::{Context, Id, err::{ApiResult, invalid_input}},
    db::types::Key,
    prelude::*,
};
use super::{Realm, RealmOrder};


impl Realm {
    pub(crate) async fn add(realm: NewRealm, context: &Context) -> ApiResult<Realm> {
        let db = context.db(context.require_moderator()?);

        // TODO: validate input

        let parent_key = id_to_key(realm.parent, "`parent`")?;
        let key: Key = db
            .query_one(
                "insert into realms (parent, name, path_segment) \
                    values ($1, $2, $3) \
                    returning id",
                &[&parent_key, &realm.name, &realm.path_segment],
            )
            .await?
            .get(0);

        Self::load_by_key(key, context).await.map(Option::unwrap)
    }

    pub(crate) async fn set_child_order(
        parent: Id,
        child_order: RealmOrder,
        // The `child_indices` argument would be better as a hash map from ID to
        // index, but that's a lot harder with juniper, unfortunately.
        child_indices: Option<Vec<ChildIndex>>,
        context: &Context,
    ) -> ApiResult<Realm> {
        // No input validation error can be the users fault. Either it's an
        // frontend error or the DB has changed since the user opened the
        // page. TODO: The latter case we should communicate to the user somehow.

        let db = context.db(context.require_moderator()?);

        // Verify and convert arguments.
        let parent_key = id_to_key(parent, "`parent`")?;

        if let Some(child_indices) = child_indices {
            if child_order != RealmOrder::ByIndex {
                return Err(invalid_input!(
                    "`setChildOrder` was called with children but not with 'BY_INDEX' order",
                ));
            }

            let all_indices_unique = {
                let index_set = child_indices.iter().map(|c| c.index).collect::<HashSet<_>>();
                index_set.len() == child_indices.len()
            };
            if !all_indices_unique {
                return Err(invalid_input!(
                    "child indices given to `setChildOrder` are not unique, but they should be",
                ));
            }

            let child_indices: HashMap<_, _> = child_indices.into_iter()
                .map(|child| {
                    let key = id_to_key(child.id, "ID of child")?;
                    Ok((key, child.index))
                })
                .collect::<ApiResult<_>>()?;


            // Retrieve the current children of the given realm
            let current_children: Vec<(_, i32)> = db
                .query_raw("select id, index from realms where parent = $1", [parent_key])
                .await?
                .map_ok(|row| (row.get(0), row.get(1)))
                .try_collect()
                .await?;

            // Make sure the list of given children matches the current ones.
            if current_children.len() != child_indices.len() {
                return Err(invalid_input!(
                    "number of children given to `setChildOrder` does not match DB",
                ));
            }
            for (key, _) in &current_children {
                if !child_indices.contains_key(key) {
                    return Err(invalid_input!(
                        "child {} of realm {} is missing in children given to `setChildOrder`",
                        Id::realm(*key),
                        parent,
                    ));
                }
            }

            // Write new indices to the DB.
            for (key, index) in child_indices {
                db.execute("update realms set index = $1 where id = $2", &[&index, &key]).await?;
            }
        } else {
            if child_order == RealmOrder::ByIndex {
                return Err(invalid_input!(
                    "`setChildOrder` as called without children but with 'BY_INDEX' order",
                ));
            }

            db
                .execute(
                    "update realms set index = default where parent = $1",
                    &[&parent_key],
                )
                .await?;
        }

        // Write the order to DB
        db.execute(
            "update realms set child_order = $1 where id = $2",
            &[&child_order, &parent_key],
        ).await?;
        debug!("Set 'child_order' of realm {} to {:?}", parent, child_order);


        // Load the updated realm. If the realm does not exist, we either
        // noticed the error above or the above queries did not change
        // anything.
        Realm::load_by_key(parent_key, &context)
            .await
            .and_then(|realm| realm.ok_or_else(|| {
                // TODO: tell user the realm was removed
                invalid_input!("`parent` realm does not exist (for `setChildOrder`)")
            }))
    }

    pub(crate) async fn rename(id: Id, name: UpdatedRealmName, context: &Context) -> ApiResult<Realm> {
        let db = context.db(context.require_moderator()?);
        let key = id_to_key(id, "`id`")?;
        if name.plain.is_some() == name.block.is_some() {
            return Err(invalid_input!("exactly one of name.block and name.plain has to be set"));
        }
        let block = name.block
            .map(|id| id.key_for(Id::BLOCK_KIND)
                .ok_or_else(|| invalid_input!("name.block does not refer to a block")))
            .transpose()?;

        let stmt = "
            update realms set \
                name = $2, \
                name_from_block = $3 \
                where id = $1
            ";
        let affected_rows = db.execute(stmt, &[&key, &name.plain, &block]).await?;

        if affected_rows != 1 {
            return Err(invalid_input!("`id` does not refer to an existing realm"));
        }

        Self::load_by_key(key, context).await.map(Option::unwrap)
    }

    pub(crate) async fn update(id: Id, set: UpdateRealm, context: &Context) -> ApiResult<Realm> {
        // TODO: validate input

        let db = context.db(context.require_moderator()?);

        let key = id_to_key(id, "`id`")?;
        let parent_key = set.parent.map(|parent| id_to_key(parent, "`parent`")).transpose()?;

        let affected_rows = db
            .execute(
                "update realms set \
                    parent = coalesce($2, parent), \
                    path_segment = coalesce($3, path_segment) \
                    where id = $1",
                &[&key, &parent_key, &set.path_segment],
            )
            .await?;

        if affected_rows != 1 {
            return Err(invalid_input!("`id` does not refer to an existing realm"));
        }

        Self::load_by_key(key, context).await.map(Option::unwrap)
    }

    pub(crate) async fn remove(id: Id, context: &Context) -> ApiResult<RemovedRealm> {
        let db = context.db(context.require_moderator()?);

        let key = id_to_key(id, "`id`")?;
        if key.0 == 0 {
            return Err(invalid_input!("Cannot remove the root realm"));
        }

        let realm = Self::load_by_key(key, context).await?
            .ok_or_else(|| invalid_input!("`id` does not refer to an existing realm"))?;

        db.execute("delete from realms where id = $1", &[&key]).await?;

        // We checked above that `realm` is not the root realm, so we can unwrap.
        let parent = Self::load_by_key(realm.parent_key.expect("missing parent"), context)
            .await?
            .expect("realm has no parent");

        Ok(RemovedRealm { parent })
    }
}

/// Makes sure the ID refers to a realm and returns its key.
fn id_to_key(id: Id, name: &str) -> ApiResult<Key> {
    id.key_for(Id::REALM_KIND)
        .ok_or_else(|| invalid_input!("{} does not refer to a realm", name))
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct ChildIndex {
    id: Id,
    index: i32,
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct UpdateRealm {
    parent: Option<Id>,
    path_segment: Option<String>,
}

/// Exactly one of `plain` or `block` has to be non-null.
#[derive(juniper::GraphQLInputObject)]
pub(crate) struct UpdatedRealmName {
    plain: Option<String>,
    block: Option<Id>,
}

impl UpdatedRealmName {
    pub(crate) fn from_block(block: Id) -> Self {
        Self {
            plain: None,
            block: Some(block),
        }
    }
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct NewRealm {
    pub(crate) parent: Id,
    pub(crate) name: String,
    pub(crate) path_segment: String,
}

#[derive(Clone, juniper::GraphQLInputObject)]
pub(crate) struct RealmSpecifier {
    pub(crate) name: Option<String>,
    pub(crate) path_segment: String,
}

#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct RemovedRealm {
    parent: Realm,
}
