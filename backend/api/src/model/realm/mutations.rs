use std::collections::{HashMap, HashSet};

use futures::TryStreamExt;
use juniper::{FieldError, FieldResult};
use crate::{id::Id, model::realm::{Realm, RealmOrder}, util::RowExt};

use super::Context;
use tobira_util::prelude::*;

impl Realm {
    pub(crate) async fn set_child_order(
        parent: Id,
        child_order: RealmOrder,
        // The `child_indices` argument would be better as a hash map from ID to
        // index, but that's a lot harder with juniper, unfortunately.
        child_indices: Option<Vec<ChildIndex>>,
        context: &Context,
    ) -> FieldResult<Realm> {
        // Verify and convert arguments.
        let parent_key = parent.key_for(Id::REALM_KIND).ok_or_else(|| {
            FieldError::new("given parent ID is not a realm", juniper::Value::Null)
        })?;

        if let Some(child_indices) = child_indices {
            if child_order != RealmOrder::ByIndex {
                return Err(FieldError::new(
                    "`setChildOrder` was called with children but not with 'BY_INDEX' order",
                    juniper::Value::Null,
                ));
            }

            if child_indices.is_empty() {
                return Err(FieldError::new(
                    "`setChildOrder` was called with zero children",
                    juniper::Value::Null,
                ));
            }

            let all_indices_unique = {
                let index_set = child_indices.iter().map(|c| c.index).collect::<HashSet<_>>();
                index_set.len() == child_indices.len()
            };
            if !all_indices_unique {
                return Err(FieldError::new(
                    "child indices given to `setChildOrder` are not unique, but they should be",
                    juniper::Value::Null,
                ));
            }

            let child_indices: HashMap<_, _> = child_indices.into_iter()
                .map(|child| {
                    let key = child.id.key_for(Id::REALM_KIND).ok_or_else(|| {
                        FieldError::new("ID of child is not a realm", juniper::Value::Null)
                    })?;
                    Ok((key, child.index))
                })
                .collect::<FieldResult<_, _>>()?;


            // Retrieve the current children of the given realm
            let current_children: Vec<(_, i32)> = context.db
                .query_raw("select id, index from realms where parent = $1", [parent_key as i64])
                .await?
                .map_ok(|row| (row.get_key(0), row.get(1)))
                .try_collect()
                .await?;

            // Make sure the list of given children matches the current ones.
            if current_children.len() != child_indices.len() {
                return Err(FieldError::new(
                    "number of children given to `setChildOrder` does not match DB",
                    juniper::Value::Null,
                ));
            }
            for (key, _) in &current_children {
                if !child_indices.contains_key(key) {
                    let msg = format!(
                        "child {} of realm {} is missing in children given to `setChildOrder`",
                        Id::realm(*key),
                        parent,
                    );
                    return Err(FieldError::new(msg, juniper::Value::Null));
                }
            }

            // Write new indices to the DB.
            for (key, index) in child_indices {
                context.db
                    .execute("update realms set index = $1 where id = $2", &[&index, &(key as i64)])
                    .await?;
            }
        } else {
            if child_order == RealmOrder::ByIndex {
                return Err(FieldError::new(
                    "`setChildOrder` as called without children but with 'BY_INDEX' order",
                    juniper::Value::Null,
                ));
            }

            context.db
                .execute(
                    "update realms set index = default where parent = $1",
                    &[&(parent_key as i64)],
                )
                .await?;
        }

        // Write the order to DB
        context.db
            .execute(
                "update realms set child_order = $1 where id = $2",
                &[&child_order, &(parent_key as i64)],
            )
            .await?;
        debug!("Set 'child_order' of realm {} to {:?}", parent, child_order);


        // We can unwrap the inner option because we know the realm exists. We
        // checked above that there is at least one child and confirmed we see
        // that one child in the DB when using `parent = $parent_key`.
        Realm::load_by_key(parent_key, &context).await.map(Option::unwrap)
    }
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct ChildIndex {
    id: Id,
    index: i32,
}
