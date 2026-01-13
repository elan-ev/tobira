use meilisearch_sdk::search::{Selectors, MatchingStrategies};
use serde::Deserialize;

use crate::{
    api::{err::ApiResult, Context},
    model::TranslatedString,
    db::util::{impl_from_db, select},
    prelude::*,
};
use super::search::{handle_search_result, measure_search_duration, SearchResults, SearchUnavailable};


// ===== Groups ===============================================================

/// A group selectable in the ACL UI. Basically a mapping from role to a nice
/// label and info about the relationship to other roles/groups.
#[derive(juniper::GraphQLObject)]
pub struct KnownGroup {
    pub(crate) role: String,
    pub(crate) label: TranslatedString,
    pub(crate) implies: Vec<String>,
    pub(crate) sort_key: Option<String>,
    pub(crate) large: bool,
}

impl_from_db!(
    KnownGroup,
    select: {
        known_groups.{ role, label, implies, sort_key, large },
    },
    |row| {
        KnownGroup {
            role: row.role(),
            label: row.label(),
            implies: row.implies(),
            sort_key: row.sort_key(),
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

    pub(crate) async fn load_for_user(context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let user_roles = context.auth.state.roles().into_iter().collect::<Vec<_>>();
        let query = format!("select {selection} from known_groups where role = any($1)");

        context.db.query_mapped(&query, dbargs![&user_roles], |row| Self::from_row_start(&row))
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
    let elapsed_time = measure_search_duration();
    if !context.auth.state.is_user() {
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
    let mut total_hits = items.len();
    if let Some(res) = meili_results {
        let results = handle_search_result!(res, KnownUsersSearchOutcome);

        // Remove duplicates. This looks like quadratic time, but `items` (the
        // DB result) will be very short, almost all the time having 0 or 1
        // results. So this is fine.
        items.retain(|item| !results.hits.iter().any(|h| h.result.user_role == item.user_role));
        total_hits = items.len() + results.estimated_total_hits
            .expect("no total hits estimate from Meili");
        items.extend(results.hits.into_iter().map(|h| h.result));
    }

    Ok(KnownUsersSearchOutcome::Results(SearchResults { items, total_hits, duration: elapsed_time() }))
}
