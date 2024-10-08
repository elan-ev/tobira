use std::collections::{HashMap, HashSet};

use crate::{
    api::{
        Context,
        err::{invalid_input, map_db_err, ApiResult},
        Id,
        model::block::RemovedBlock,
    },
    auth::AuthContext,
    db::types::Key,
    prelude::*,
};
use super::{Realm, RealmOrder};



impl Realm {
    pub(crate) async fn add(realm: NewRealm, context: &Context) -> ApiResult<Realm> {
        let Some(parent) = Self::load_by_id(realm.parent, context).await? else {
            return Err(invalid_input!("`parent` realm does not exist"));
        };
        parent.require_moderator_rights(context)?;
        let db = &context.db;

        // Check if the path is a reserved one.
        let path_is_reserved = context.config.general.reserved_paths()
            .any(|r| realm.path_segment == r);
        if parent.is_main_root() && path_is_reserved {
            return Err(invalid_input!(key = "realm.path-is-reserved", "path is reserved and cannot be used"));
        }

        let roles = match &context.auth {
            AuthContext::User(user) if !parent.is_current_user_owner(context) => vec![&user.user_role],
            _ => vec![]
        };

        let res = db.query_one(
            "insert into realms (parent, name, path_segment, admin_roles, moderator_roles) \
                values ($1, $2, $3, $4, $4) \
                returning id",
            &[&parent.key, &realm.name, &realm.path_segment, &roles],
        ).await;

        let row = map_db_err!(res, {
            if constraint == "idx_realm_path" => invalid_input!(
                key = "realm.path-collision",
                "realm with that path already exists",
            ),
            // This logic is already checked by the frontend, so no translation key.
            if constraint == "valid_path" => invalid_input!("path invalid"),
        })?;
        let key: Key = row.get(0);

        Self::load_by_key(key, context).await.map(Option::unwrap).inspect_(|realm| {
            let Self { key, full_path, resolved_name, .. } = realm;
            info!(path = full_path, ?key, ?resolved_name, "Created realm");
        })
    }

    pub(crate) async fn create_user_realm(context: &Context) -> ApiResult<Realm> {
        if !context.auth.can_create_user_realm(&context.config.auth) {
            return Err(context.access_error(
                "realm.cannot-create-user-realm",
                |user| format!("'{user}' is not allowed to create their user realm")
            ));
        }
        let AuthContext::User(user) = &context.auth else { unreachable!() };
        let db = &context.db;

        let res = db.query_one(
            "insert into realms (parent, name, path_segment, owner_display_name) \
                values (null, $1, $2, $1) \
                returning id",
            &[&user.display_name, &format!("@{}", user.username)],
        ).await;

        let row = map_db_err!(res, {
            if constraint == "idx_realm_path" => invalid_input!(
                key = "realm.user-realm-already-exists",
                "user realm already exists",
            ),
            if constraint == "valid_path" => invalid_input!(
                key = "realm.username-not-valid-as-path",
                "username contains invalid characters for realm path",
            ),
        })?;
        let key: Key = row.get(0);

        Self::load_by_key(key, context).await.map(Option::unwrap).inspect_(|_| {
            info!(
                username = user.username,
                display_name = user.display_name,
                ?key,
                "Created root user realm",
            );
        })
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

        let Some(parent) = Self::load_by_id(parent, context).await? else {
            // TODO: this is likely caused by a realm being removed while a user
            // is on the settings page. Maybe we want to give a hint.
            return Err(invalid_input!("`parent` realm does not exist (for `setChildOrder`)"));
        };
        parent.require_moderator_rights(context)?;
        let db = &context.db;

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
                .query_raw("select id, index from realms where parent = $1", [parent.key])
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
                        "child {} of realm '{}' is missing in children given to `setChildOrder`",
                        Id::realm(*key),
                        parent.full_path,
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
                    &[&parent.key],
                )
                .await?;
        }

        // Write the order to DB
        db.execute(
            "update realms set child_order = $1 where id = $2",
            &[&child_order, &parent.key],
        ).await?;
        debug!("Set 'child_order' of realm '{}' to {:?}", parent.full_path, child_order);


        // Load the updated realm. We already know it exists, so we can unwrap.
        Realm::load_by_key(parent.key, &context).await.map(Option::unwrap)
    }

    pub(crate) async fn rename(id: Id, name: UpdatedRealmName, context: &Context) -> ApiResult<Realm> {
        let Some(realm) = Self::load_by_id(id, context).await? else {
            return Err(invalid_input!("`id` does not refer to an existing realm"));
        };
        realm.require_moderator_rights(context)?;

        let db = &context.db;
        if name.plain.is_some() == name.block.is_some() {
            return Err(invalid_input!("exactly one of name.block and name.plain has to be set"));
        }
        let block = name.block
            .map(|id| id.key_for(Id::BLOCK_KIND)
                .ok_or_else(|| invalid_input!("name.block does not refer to a block")))
            .transpose()?;

        // TODO: the DB will already check that the block has a fitting type and
        // that it belongs to the realm, but those errors should result in
        // an "invalid input" error.
        let stmt = "
            update realms set \
                name = $2, \
                name_from_block = $3 \
                where id = $1
            ";
        db.execute(stmt, &[&realm.key, &name.plain, &block]).await?;

        Self::load_by_key(realm.key, context).await.map(Option::unwrap).inspect_(|new| {
            info!(
                "Renamed realm {:?} ({}) from '{:?}' to '{:?}'",
                realm.key,
                realm.full_path,
                realm.resolved_name,
                new.resolved_name,
            );
        })
    }

    pub(crate) async fn update_permissions(
        id: Id,
        permissions: UpdatedPermissions,
        context: &Context,
    ) -> ApiResult<Realm> {
        let Some(realm) = Self::load_by_id(id, context).await? else {
            return Err(invalid_input!("`id` does not refer to an existing realm"));
        };
        realm.require_admin_rights(context)?;
        let db = &context.db;

        db.execute(
            "update realms set \
            moderator_roles = coalesce($2, moderator_roles), \
            admin_roles = coalesce($3, admin_roles) \
            where id = $1",
            &[&realm.key, &permissions.moderator_roles, &permissions.admin_roles],
        )
        .await?;

        Self::load_by_key(realm.key, context).await.map(Option::unwrap).inspect_(|new| {
            info!(
                "Updated permissions of realm {:?} ({}) from moderators: '{:?}' to '{:?}' and from admins: '{:?}' to '{:?}'",
                realm.key,
                realm.full_path,
                realm.moderator_roles,
                new.moderator_roles,
                realm.admin_roles,
                new.admin_roles,
            );
        })
    }


    pub(crate) async fn update(id: Id, set: UpdateRealm, context: &Context) -> ApiResult<Realm> {
        // TODO: validate input

        let Some(realm) = Self::load_by_id(id, context).await? else {
            return Err(invalid_input!("`id` does not refer to an existing realm"));
        };
        realm.require_admin_rights(context)?;
        let db = &context.db;

        if realm.is_user_root() {
            return Err(invalid_input!("cannot move or change path segment of user root realm"));
        }

        let parent_key = set.parent.map(|parent| id_to_key(parent, "`parent`")).transpose()?;

        // We have to make sure the path is not changed to a reserved one.
        if let Some(path_segment) = &set.path_segment {
            if context.config.general.reserved_paths().any(|r| path_segment == r) {
                let err = invalid_input!("path is reserved and cannot be used");
                match parent_key {
                    // If the parent is changed to be the root realm, it's an error.
                    Some(Key(0)) => return Err(err),
                    // If the parent is changed to something else than the root realm, it's fine.
                    Some(_) => {}
                    // If the parent is not changed, we unfortunately need to
                    // check the DB whether this realm is a top-level one.
                    None => {
                        let real_parent = db
                            .query_one("select parent from realms where id = $1", &[&realm.key])
                            .await?
                            .get::<_, Key>(0);

                        if real_parent.0 == 0 {
                            return Err(err);
                        }
                    }
                }
            }
        }

        db
            .execute(
                "update realms set \
                    parent = coalesce($2, parent), \
                    path_segment = coalesce($3, path_segment) \
                    where id = $1",
                &[&realm.key, &parent_key, &set.path_segment],
            )
            .await?;

        // Load realm with new data.
        Self::load_by_key(realm.key, context).await.map(Option::unwrap).inspect_(|_| {
            info!("Updated realm {:?} ({}): {:?}", realm.key, realm.full_path, set);
        })
    }

    pub(crate) async fn remove(id: Id, context: &Context) -> ApiResult<RemovedRealm> {
        let Some(realm) = Self::load_by_id(id, context).await? else {
            return Err(invalid_input!("`id` does not refer to an existing realm"));
        };
        realm.require_admin_rights(context)?;
        let db = &context.db;

        if realm.is_main_root() {
            return Err(invalid_input!("Cannot remove the root realm"));
        }

        db.execute("delete from realms where id = $1", &[&realm.key]).await?;

        let parent = match realm.parent_key {
            Some(parent) => Self::load_by_key(parent, context).await?,
            None => None,
        };

        info!(%id, path = realm.full_path, "Removed realm");
        Ok(RemovedRealm { parent })
    }

    pub(crate) async fn create_lineage(
        realms: Vec<RealmLineageComponent>,
        context: &Context,
    ) -> ApiResult<CreateRealmLineageOutcome> {
        context.auth.required_trusted_external()?;

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

#[derive(Debug, juniper::GraphQLInputObject)]
pub(crate) struct UpdateRealm {
    parent: Option<Id>,
    path_segment: Option<String>,
}

#[derive(juniper::GraphQLInputObject)]
pub(crate) struct UpdatedPermissions {
    moderator_roles: Option<Vec<String>>,
    admin_roles: Option<Vec<String>>,
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

    pub(crate) fn plain(name: String) -> Self {
        Self {
            plain: Some(name),
            block: None,
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

#[derive(Clone, juniper::GraphQLInputObject)]
pub(crate) struct RealmLineageComponent {
    pub(crate) name: String,
    pub(crate) path_segment: String,
}

#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct RemovedRealm {
    parent: Option<Realm>,
}

#[derive(juniper::GraphQLObject)]
pub struct CreateRealmLineageOutcome {
    pub num_created: i32,
}

#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum RemoveMountedSeriesOutcome {
    RemovedRealm(RemovedRealm),
    RemovedBlock(RemovedBlock),
}
