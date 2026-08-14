use std::collections::HashSet;

use serde::Deserialize;

use crate::{api::Context, db::{types::ActionRoleMap, util::{impl_from_db}}, prelude::*};

use super::{TranslatedString};


// ===== Groups ===============================================================

/// A group selectable in the ACL UI. Basically a mapping from role to a nice
/// label and info about the relationship to other roles/groups.
#[derive(Debug)]
pub struct KnownGroup {
    pub role: String,
    pub label: TranslatedString,
    pub implies: Vec<String>,
    pub sort_key: Option<String>,
    pub warn_for_action: Vec<String>,
    pub assignable_by: ActionRoleMap,
}

impl_from_db!(
    KnownGroup,
    select: {
        known_groups.{ role, label, implies, sort_key, warn_for_action, assignable_by },
    },
    |row| {
        KnownGroup {
            role: row.role(),
            label: row.label(),
            implies: row.implies(),
            sort_key: row.sort_key(),
            warn_for_action: row.warn_for_action(),
            assignable_by: row.assignable_by(),
        }
    },
);

impl KnownGroup {
    pub(crate) async fn load_all(context: &Context) -> Result<Vec<Self>, tokio_postgres::Error> {
        let selection = Self::select();
        let query = format!("select {selection} from known_groups");
        context.db.query_mapped(&query, dbargs![], |row| Self::from_row_start(&row)).await
    }

    /// Loads the known-group rows matching any of the given roles. Roles with
    /// no matching row are simply absent from the result since they are not
    /// tracked as known groups.
    pub(crate) async fn load_by_roles(
        roles: &[&str],
        context: &Context,
    ) -> Result<Vec<Self>, tokio_postgres::Error> {
        let selection = Self::select();
        let query = format!("select {selection} from known_groups where role = any($1)");
        context.db.query_mapped(&query, dbargs![&roles], |row| Self::from_row_start(&row)).await
    }

    /// Returns the set of actions that the current user is allowed to hand out for a specific group.
    pub(crate) fn actions_assignable_by(
        &self,
        user_roles: &HashSet<String>,
        is_admin: bool,
    ) -> Vec<String> {
        actions_assignable_by(&self.assignable_by, user_roles, is_admin)
    }
}

/// Returns the set of actions that the current user is allowed to hand out for a specific group.
pub(crate) fn actions_assignable_by(
    assignable_by: &ActionRoleMap,
    user_roles: &HashSet<String>,
    is_admin: bool,
) -> Vec<String> {
    let mut candidate_actions: HashSet<&str> = ["read", "write"].into_iter().collect();
    candidate_actions.extend(assignable_by.0.keys().map(String::as_str));

    let is_allowed_for = |action: &str| {
        assignable_by.0.get(action)
            .is_some_and(|roles| roles.iter().any(|role| user_roles.contains(role)))
    };

    candidate_actions.into_iter()
        .filter(|action| {
            is_admin || is_allowed_for(action) || (*action == "read" && is_allowed_for("write"))
        })
        .map(str::to_owned)
        .collect()
}



// ===== Users ===============================================================

#[derive(juniper::GraphQLObject, Deserialize)]
pub(crate) struct KnownUser {
    pub display_name: String,
    pub user_role: String,
}
