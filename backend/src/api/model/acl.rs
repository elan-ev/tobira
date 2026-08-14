use juniper::GraphQLObject;
use postgres_types::BorrowToSql;

use crate::{
    HasRoles,
    api::{err::ApiResult, Context},
    db::{types::ActionRoleMap, util::select},
    model::{actions_assignable_by, TranslatedString},
};




pub(crate) type Acl = Vec<AclItemWithInfo>;

/// An `AclItem` with extra about the role.
#[derive(Debug, GraphQLObject)]
#[graphql(context = Context)]
pub(crate) struct AclItemWithInfo {
    /// Role. In arrays of AclItems, no two items have the same `role`.
    pub role: String,

    /// List of actions this role can perform (e.g. `read`, `write`,
    /// `annotate`). This is a set, i.e. no duplicate elements.
    pub actions: Vec<String>,

    /// Additional info we have about the role. Is `null` if the role is
    /// unknown. For the built-in roles `ROLE_ANONYMOUS`, `ROLE_ADMIN` and
    /// `ROLE_USER`, this might be `null` as well (in which case there is
    /// special handling in the frontend), but might be non-null if custom info
    /// is configured.
    pub info: Option<RoleInfo>,
}

/// Some extra information we know about a role.
#[derive(Debug, GraphQLObject)]
#[graphql(context = Context)]
pub(crate) struct RoleInfo {
    /// A user-facing label for this role (group or person). If the label does
    /// not depend on the language (e.g. a name), `{ "default": "Peter" }` is
    /// returned.
    pub label: TranslatedString,

    /// For user roles this is `null`. For groups, it defines a list of other
    /// group roles that this role implies. I.e. a user with this role always
    /// also has these other roles.
    pub implies: Option<Vec<String>>,

    /// List of actions that should trigger a warning when assigning this
    /// role, e.g. because it represents an unusually large or broad group.
    /// Always empty for roles that are not a known group.
    pub warn_for_action: Vec<String>,

    /// Actions the current user is allowed to assign this role for.
    /// `null` if the role is not a known group (like free-text roles added in the ACL selector).
    /// In that case the assignment is unrestricted.
    pub assignable_actions: Option<Vec<String>>,
}

pub(crate) fn query_for(table: &str) -> String {
    format!("\
        select unnest(read_roles) as role, 'read' as action from {table} where id = $1
        union
        select unnest(write_roles) as role, 'write' as action from {table} where id = $1
    ")
}

pub(crate) async fn load_for<P, I>(
    context: &Context,
    raw_roles: &str,
    params: I,
) -> ApiResult<Acl>
where
    P: BorrowToSql,
    I: IntoIterator<Item = P> + std::fmt::Debug,
    I::IntoIter: ExactSizeIterator,
{
    // First: load labels for roles from the DB. For that we use the `users`
    // and `known_groups` table.
    // `assignable_by` is deliberately *not* coalesced, because
    // `NULL` is how we tell "not a known group" (unrestricted
    // assignment) apart from "known group with an empty `assignable_by`".
    // That is only relevant for admins though.
    let (selection, mapping) = select!(
        role: "roles.role",
        actions,
        implies,
        warn_for_action: "coalesce(known_groups.warn_for_action, '{}')",
        assignable_by: "known_groups.assignable_by",
        label: "coalesce(
            known_groups.label,
            case when users.display_name is null
                then null
                else hstore('default', users.display_name)
            end
        )",
    );
    let sql = format!("\
        with raw_roles as ({raw_roles}),
        roles as (
            select role, array_agg(action) as actions
            from raw_roles
            group by role
        )
        select {selection}
        from roles
        left join users on users.user_role = role
        left join known_groups on known_groups.role = roles.role\
    ");

    let is_admin = context.auth.is_admin(&context.config.auth);
    let user_roles = context.auth.roles();

    context.db.query_mapped(&sql, params, |row| {
        let assignable_actions = mapping.assignable_by.of::<Option<ActionRoleMap>>(&row)
            .map(|assignable_by| actions_assignable_by(&assignable_by, user_roles, is_admin));

        AclItemWithInfo {
            role: mapping.role.of(&row),
            actions: mapping.actions.of(&row),
            info: mapping.label.of::<Option<_>>(&row).map(|label| RoleInfo {
                label,
                implies: mapping.implies.of(&row),
                warn_for_action: mapping.warn_for_action.of(&row),
                assignable_actions,
            }),
        }
    }).await.map_err(Into::into)
}
