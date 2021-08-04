use std::collections::{HashMap, HashSet};

use futures::TryStreamExt;
use juniper::{FieldError, FieldResult};

use crate::{id::{Id, Key}, model::realm::{Realm, RealmOrder}};
use super::Context;
use tobira_util::prelude::*;


/// Creates a `FieldError`. Works like `format!`.
macro_rules! ferr {
    ($fmt:literal $(, $arg:expr)* $(,)?) => {
        FieldError::new(format!($fmt $(, $arg)*), juniper::Value::Null)
    };
}

impl Realm {
    pub(crate) async fn add(realm: NewRealm, context: &Context) -> FieldResult<Realm> {
        let parent_key = id_to_key(realm.parent, "`parent`")?;
        let key: Key = context.db
            .query_one(
                "insert into realms (parent, name, path_segment)
                    values ($1, $2, $3)
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
    ) -> FieldResult<Realm> {
        // Verify and convert arguments.
        let parent_key = id_to_key(parent, "`parent`")?;

        if let Some(child_indices) = child_indices {
            if child_order != RealmOrder::ByIndex {
                return Err(ferr!(
                    "`setChildOrder` was called with children but not with 'BY_INDEX' order",
                ));
            }

            if child_indices.is_empty() {
                return Err(ferr!("`setChildOrder` was called with zero children"));
            }

            let all_indices_unique = {
                let index_set = child_indices.iter().map(|c| c.index).collect::<HashSet<_>>();
                index_set.len() == child_indices.len()
            };
            if !all_indices_unique {
                return Err(ferr!(
                    "child indices given to `setChildOrder` are not unique, but they should be",
                ));
            }

            let child_indices: HashMap<_, _> = child_indices.into_iter()
                .map(|child| {
                    let key = id_to_key(child.id, "ID of child")?;
                    Ok((key, child.index))
                })
                .collect::<FieldResult<_, _>>()?;


            // Retrieve the current children of the given realm
            let current_children: Vec<(_, i32)> = context.db
                .query_raw("select id, index from realms where parent = $1", [parent_key])
                .await?
                .map_ok(|row| (row.get(0), row.get(1)))
                .try_collect()
                .await?;

            // Make sure the list of given children matches the current ones.
            if current_children.len() != child_indices.len() {
                return Err(ferr!(
                    "number of children given to `setChildOrder` does not match DB",
                ));
            }
            for (key, _) in &current_children {
                if !child_indices.contains_key(key) {
                    return Err(ferr!(
                        "child {} of realm {} is missing in children given to `setChildOrder`",
                        Id::realm(*key),
                        parent,
                    ));
                }
            }

            // Write new indices to the DB.
            for (key, index) in child_indices {
                context.db
                    .execute("update realms set index = $1 where id = $2", &[&index, &key])
                    .await?;
            }
        } else {
            if child_order == RealmOrder::ByIndex {
                return Err(ferr!(
                    "`setChildOrder` as called without children but with 'BY_INDEX' order",
                ));
            }

            context.db
                .execute(
                    "update realms set index = default where parent = $1",
                    &[&parent_key],
                )
                .await?;
        }

        // Write the order to DB
        context.db
            .execute(
                "update realms set child_order = $1 where id = $2",
                &[&child_order, &parent_key],
            )
            .await?;
        debug!("Set 'child_order' of realm {} to {:?}", parent, child_order);


        // Load the updated realm. If the realm does not exist, we either
        // noticed the error above or the above queries did not change
        // anything.
        Realm::load_by_key(parent_key, &context)
            .await
            .and_then(|realm| realm.ok_or_else(|| {
                ferr!("`parent` realm does not exist (for `setChildOrder`)")
            }))
    }

    pub(crate) async fn update(id: Id, set: UpdateRealm, context: &Context) -> FieldResult<Realm> {
        let key = id_to_key(id, "`id`")?;
        let parent_key = set.parent.map(|parent| id_to_key(parent, "`parent`")).transpose()?;

        let affected_rows = context.db
            .execute(
                "update realms set
                    parent = coalesce($2, parent),
                    name = coalesce($3, name),
                    path_segment = coalesce($4, path_segment)
                    where id = $1",
                &[&key, &parent_key, &set.name, &set.path_segment],
            )
            .await?;

        if affected_rows != 1 {
            return Err(ferr!("`id` does not refer to an existing realm"));
        }

        Self::load_by_key(key, context).await.map(Option::unwrap)
    }

    pub(crate) async fn remove(id: Id, context: &Context) -> FieldResult<RemovedRealm> {
        let key = id_to_key(id, "`id`")?;
        if key.0 == 0 {
            return Err(ferr!("Cannot remove the root realm"));
        }

        let realm = Self::load_by_key(key, context).await?
            .ok_or_else(|| ferr!("`id` does not refer to an existing realm"))?;

        context.db
            .execute("delete from realms where id = $1", &[&key])
            .await?;

        Ok(RemovedRealm {
            // We checked above that `realm` is not the root realm, so we can unwrap.
            parent: Id::realm(realm.parent_key.expect("missing parent")),
        })
    }
}

/// Makes sure the ID refers to a realm and returns its key.
fn id_to_key(id: Id, name: &str) -> FieldResult<Key> {
    id.key_for(Id::REALM_KIND)
        .ok_or_else(|| ferr!("{} does not refer to a realm", name))
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct ChildIndex {
    id: Id,
    index: i32,
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct UpdateRealm {
    parent: Option<Id>,
    name: Option<String>,
    path_segment: Option<String>,
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct NewRealm {
    parent: Id,
    name: String,
    path_segment: String,
}

#[derive(juniper::GraphQLObject)]
pub(crate) struct RemovedRealm {
    parent: Id,
}
