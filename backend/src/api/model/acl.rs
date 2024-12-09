use juniper::{GraphQLInputObject, GraphQLObject};
use postgres_types::BorrowToSql;
use serde::Serialize;

use crate::{api::{util::TranslatedString, Context, err::ApiResult}, db::util::select};




pub(crate) type Acl = Vec<AclItem>;

/// A role being granted permission to perform certain actions.
#[derive(Debug, GraphQLObject)]
#[graphql(context = Context)]
pub(crate) struct AclItem {
    /// Role. In arrays of AclItems, no two items have the same `role`.
    pub role: String,

    /// List of actions this role can perform (e.g. `read`, `write`,
    /// `annotate`). This is a set, i.e. no duplicate elements.
    pub actions: Vec<String>,

    /// Additional info we have about the role. Is `null` if the role is unknown
    /// or is `ROLE_ANONYMOUS`, `ROLE_ADMIN` or `ROLE_USER`, as those are
    /// handled in a special way in the frontend.
    pub info: Option<RoleInfo>,
}

/// Some extra information we know about a role.
#[derive(Debug, GraphQLObject)]
#[graphql(context = Context)]
pub(crate) struct RoleInfo {
    /// A user-facing label for this role (group or person). If the label does
    /// not depend on the language (e.g. a name), `{ "_": "Peter" }` is
    /// returned.
    pub label: TranslatedString<String>,

    /// For user roles this is `null`. For groups, it defines a list of other
    /// group roles that this role implies. I.e. a user with this role always
    /// also has these other roles.
    pub implies: Option<Vec<String>>,

    /// Is `true` if this role represents a large group. Used to warn users
    /// accidentally giving write access to large groups.
    pub large: bool,
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
    let (selection, mapping) = select!(
        role: "roles.role",
        actions,
        implies,
        large: "coalesce(known_groups.large, false)",
        label: "coalesce(
            known_groups.label,
            case when users.display_name is null
                then null
                else hstore('_', users.display_name)
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

    context.db.query_mapped(&sql, params, |row| {
        AclItem {
            role: mapping.role.of(&row),
            actions: mapping.actions.of(&row),
            info: mapping.label.of::<Option<_>>(&row).map(|label| RoleInfo {
                label,
                implies: mapping.implies.of(&row),
                large: mapping.large.of(&row),
            }),
        }
    }).await.map_err(Into::into)
}

#[derive(Debug, GraphQLInputObject, Serialize)]
pub(crate) struct AclInputEntry {
    pub role: String,
    pub actions: Vec<String>,
}
