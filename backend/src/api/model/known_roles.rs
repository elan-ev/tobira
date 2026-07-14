use meilisearch_sdk::search::{Selectors, MatchingStrategies};

use crate::{
    api::{err::ApiResult, Context},
    model::{KnownUser, OpencastKnownUser},
    db::util::select,
    prelude::*,
};
use super::search::{handle_search_result, measure_search_duration, SearchResults, SearchUnavailable};



#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum KnownUsersSearchOutcome {
    SearchUnavailable(SearchUnavailable),
    Results(SearchResults<KnownUser>),
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

/// Looks up a single known user by exact username.
pub(crate) async fn lookup_known_user(
    username: String,
    context: &Context,
) -> ApiResult<Option<OpencastKnownUser>> {
    if !context.auth.is_admin(&context.config.auth) {
        return Err(context.not_logged_in_error());
    }

    let (selection, mapping) = select!(username, display_name, email, user_role);
    let query = format!("select {selection} from users where lower(username) = $1 limit 1");
    let users = context.db.query_mapped(&query, dbargs![&username.to_lowercase()], |row| {
        OpencastKnownUser {
            username: mapping.username.of(&row),
            display_name: mapping.display_name.of(&row),
            email: mapping.email.of(&row),
            user_role: mapping.user_role.of(&row),
        }
    }).await?;

    Ok(users.into_iter().next())
}

/// Searches for known users by partial match on username, display name, email, or user role.
///
/// Passing `None` (or an empty string) for `query` returns all users, paginated by `limit`
/// and `offset`. Results are ordered by `username` for stable pagination.
pub(crate) async fn find_known_users_for_opencast(
    query: Option<String>,
    limit: i32,
    offset: i32,
    context: &Context,
) -> ApiResult<Vec<OpencastKnownUser>> {
    if !context.auth.is_admin(&context.config.auth) {
        return Err(context.not_logged_in_error());
    }

    let limit = (limit as i64).clamp(1, 1000);
    let offset = (offset as i64).max(0);

    // An empty/missing query means "no filter": return all users.
    let filter = query.as_deref().filter(|q| !q.is_empty());

    let (selection, mapping) = select!(username, display_name, email, user_role);
    let map_row = |row| OpencastKnownUser {
        username: mapping.username.of(&row),
        display_name: mapping.display_name.of(&row),
        email: mapping.email.of(&row),
        user_role: mapping.user_role.of(&row),
    };

    match filter {
        Some(q) => {
            let escaped = q.to_lowercase()
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_");
            let like_pattern = format!("%{}%", escaped);
            let sql = format!("select {selection} from users \
                where lower(username) like $1 \
                    or lower(display_name) like $1 \
                    or lower(email) like $1 \
                    or lower(user_role) like $1 \
                order by lower(username), username \
                limit $2 offset $3"
            );
            context.db.query_mapped(&sql, dbargs![&like_pattern, &limit, &offset], map_row)
                .await.map_err(Into::into)
        }
        None => {
            let sql = format!("select {selection} from users \
                order by lower(username), username \
                limit $1 offset $2"
            );
            context.db.query_mapped(&sql, dbargs![&limit, &offset], map_row)
                .await.map_err(Into::into)
        }
    }
}
