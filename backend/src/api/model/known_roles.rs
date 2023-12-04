use crate::{
    api::{Context, err::ApiResult, util::TranslatedString},
    prelude::*,
    db::util::{impl_from_db, select},
};
use super::search::{SearchUnavailable, SearchResults};


// ===== Groups ===============================================================

/// A group selectable in the ACL UI. Basically a mapping from role to a nice
/// label and info about the relationship to other roles/groups.
#[derive(juniper::GraphQLObject)]
pub struct KnownGroup {
    pub(crate) role: String,
    pub(crate) label: TranslatedString<String>,
    pub(crate) implies: Vec<String>,
    pub(crate) large: bool,
}

impl_from_db!(
    KnownGroup,
    select: {
        known_groups.{ role, label, implies, large },
    },
    |row| {
        KnownGroup {
            role: row.role(),
            label: row.label(),
            implies: row.implies(),
            large: row.large(),
        }
    },
);

impl KnownGroup {
    pub(crate) async fn load_all(context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from known_groups");
        context.db.query_mapped(&query, dbargs![], |row| Self::from_row_start(&row))
            .await?
            .pipe(Ok)
    }
}

// ===== Users ===============================================================

#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum KnownUsersSearchOutcome {
    #[allow(dead_code)] // TODO
    SearchUnavailable(SearchUnavailable),
    Results(SearchResults<KnownUser>),
}

#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct KnownUser {
    display_name: String,
    user_role: String,
}

#[juniper::graphql_object(Context = Context, name = "KnownUserSearchResults")]
impl SearchResults<KnownUser> {
    fn items(&self) -> &[KnownUser] {
        &self.items
    }
}

pub(crate) async fn search_known_users(
    query: String,
    context: &Context,
) -> ApiResult<KnownUsersSearchOutcome> {
    if !context.auth.is_user() {
        return Err(context.not_logged_in_error());
    }

    if context.config.general.users_searchable {
        // TODO: Replace this with MeiliSearch
        let (selection, mapping) = select!(display_name, user_role);
        let sql = format!("select {selection} \
            from users \
            where position($1 in lower(display_name)) > 0 \
                or position($1 in lower(username)) > 0 \
                or lower(email) = $1 \
                or lower(user_role) = $1 \
            limit 30"
        );
        let items = context.db.query_mapped(&sql, dbargs![&query.to_lowercase()], |row| {
            KnownUser {
                display_name: mapping.display_name.of(&row),
                user_role: mapping.user_role.of(&row),
            }
        }).await?;

        Ok(KnownUsersSearchOutcome::Results(SearchResults { items }))
    } else {
        // TODO: Add DB indices for this if this stays!
        let (selection, mapping) = select!(display_name, user_role);
        let sql = format!("select {selection} \
            from users \
            where lower(display_name) = $1 \
                or lower(username) = $1 \
                or lower(email) = $1 \
                or lower(user_role) = $1 \
            limit 30"
        );
        let items = context.db.query_mapped(&sql, dbargs![&query.to_lowercase()], |row| {
            KnownUser {
                display_name: mapping.display_name.of(&row),
                user_role: mapping.user_role.of(&row),
            }
        }).await?;

        Ok(KnownUsersSearchOutcome::Results(SearchResults { items }))
    }

}
