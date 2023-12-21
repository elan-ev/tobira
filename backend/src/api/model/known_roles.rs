use meilisearch_sdk::{Selectors, MatchingStrategies};
use serde::Deserialize;

use crate::{
    api::{Context, err::ApiResult, util::TranslatedString},
    prelude::*,
    db::util::{impl_from_db, select},
};
use super::search::{SearchUnavailable, SearchResults, handle_search_result};


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
    SearchUnavailable(SearchUnavailable),
    Results(SearchResults<KnownUser>),
}

#[derive(juniper::GraphQLObject, Deserialize)]
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

    // Load users with exact match from DB.
    let db_load = async {
        let (selection, mapping) = select!(display_name, user_role);
        let sql = format!("select {selection} \
            from users \
            where lower(username) = $1 \
                or lower(email) = $1 \
                or lower(user_role) = $1 \
            limit 50"
        );
        context.db.query_mapped(&sql, dbargs![&query.to_lowercase()], |row| {
            KnownUser {
                display_name: mapping.display_name.of(&row),
                user_role: mapping.user_role.of(&row),
            }
        }).await
    };

    // If the settings allow it, search users via MeiliSearch
    let meili_search = async {
        if context.config.general.users_searchable {
            context.search.user_index.search()
                .with_query(&query)
                .with_limit(50)
                .with_matching_strategy(MatchingStrategies::ALL)
                .with_attributes_to_retrieve(Selectors::Some(&["display_name", "user_role"]))
                .execute::<KnownUser>()
                .await
                .pipe(Some)
        } else {
            None
        }
    };

    // Run both loads concurrently and combine results.
    let (db_results, meili_results) = tokio::join!(db_load, meili_search);
    let mut items = db_results?;
    if let Some(res) = meili_results {
        let results = handle_search_result!(res, KnownUsersSearchOutcome);
        items.extend(results.hits.into_iter().map(|h| h.result));
    }

    Ok(KnownUsersSearchOutcome::Results(SearchResults { items }))
}
