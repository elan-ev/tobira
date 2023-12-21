use std::{time::{Instant, Duration}, collections::HashSet};

use dashmap::{DashMap, mapref::entry::Entry};
use deadpool_postgres::Client;

use crate::prelude::*;


const CACHE_DURATION: Duration = Duration::from_secs(60 * 10);

struct CacheEntry {
    display_name: String,
    email: Option<String>,
    roles: HashSet<String>,
    user_role: String,
    last_written_to_db: Instant,
}

/// Cache to remember what users we have seen. Its only purpose is to make
/// writes to the `users` table less frequent. The data from this cache must
/// not be used in any other way.
///
/// This works fine in multi-node setups: each node just has its local cache and
/// prevents some DB writes. But as this data is never used otherwise, we don't
/// run into data inconsistency problems.
pub(crate) struct UserCache(DashMap<String, CacheEntry>);

impl UserCache {
    pub(crate) fn new() -> Self {
        Self(DashMap::new())
    }

    pub(crate) async fn upsert_user_info(&self, user: &super::User, db: &Client) {
        match self.0.entry(user.username.clone()) {
            Entry::Occupied(mut occupied) => {
                let entry = occupied.get();
                let needs_update = entry.last_written_to_db.elapsed() > CACHE_DURATION
                    || entry.display_name != user.display_name
                    || entry.email != user.email
                    || entry.roles != user.roles
                    || entry.user_role != user.user_role;

                if needs_update {
                    let res = Self::write_to_db(user, db).await;
                    if res.is_ok() {
                        occupied.get_mut().last_written_to_db = Instant::now();
                    }
                }
            },
            Entry::Vacant(vacant) => {
                let res = Self::write_to_db(user, db).await;
                if res.is_ok() {
                    vacant.insert(CacheEntry {
                        display_name: user.display_name.clone(),
                        email: user.email.clone(),
                        roles: user.roles.clone(),
                        user_role: user.user_role.clone(),
                        last_written_to_db: Instant::now(),
                    });
                }
            },
        }
    }

    async fn write_to_db(user: &super::User, db: &Client) -> Result<(), ()> {
        let sql = "\
            insert into users (username, display_name, email, user_role, last_seen) \
            values ($1, $2, $3, $4, now()) \
            on conflict (username) do update set \
                display_name = excluded.display_name, \
                email = excluded.email, \
                user_role = excluded.user_role, \
                last_seen = excluded.last_seen \
        ";
        let res = db.execute(sql, &[
            &user.username,
            &user.display_name,
            &user.email,
            &user.user_role,
        ]).await;

        // We mostly just ignore errors. That's because saving the user data is
        // not THAT important. Logging a warning should make sure that this
        // doesn't fail all the time.
        //
        // It's important to note that this user saving makes every API request
        // potentially writing to the DB. If the DB is in an emergency read
        // only state, that would mean that all API requests would fail.
        if let Err(e) = res {
            warn!("Updating user data for '{}' failed: {e}", user.username);
            return Err(());
        }

        Ok(())
    }
}

