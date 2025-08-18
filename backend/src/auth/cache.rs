use std::{collections::HashSet, hash::Hash, time::{Instant, Duration}};

use deadpool_postgres::Client;
use hyper::HeaderMap;
use prometheus_client::metrics::counter::Counter;
use scc::{hash_map::Entry, HashMap};

use crate::{auth::config::CallbackCacheDuration, config::Config, prelude::*};

use super::User;

pub struct Caches {
    pub(crate) user: UserCache,
    pub(crate) callback: AuthCallbackCache,
}

impl Caches {
    pub fn new() -> Self {
        Self {
            user: UserCache::new(),
            callback: AuthCallbackCache::new(),
        }
    }

    /// Starts a daemon that regularly removes outdated entries from the cache.
    pub(crate) async fn maintainence_task(&self, config: &Config) -> ! {
        async fn cleanup<K: Eq + Hash, V>(
            now: Instant,
            map: &HashMap<K, V>,
            cache_duration: Duration,
            mut timestamp: impl FnMut(&V) -> Instant,
        ) -> Option<Instant> {
            let mut out = None;
            map.retain_async(|_, v| {
                let instant = timestamp(v);
                let is_outdated = now.saturating_duration_since(instant) > cache_duration;
                if !is_outdated {
                    out = match out {
                        None => Some(instant),
                        Some(existing) => Some(std::cmp::min(existing, instant)),
                    };
                }
                !is_outdated
            }).await;
            out.map(|out| out + cache_duration)
        }

        let empty_wait_time = {
            let mut out = CACHE_DURATION;
            if let CallbackCacheDuration::Enabled(duration) = config.auth.callback.cache_duration {
                out = std::cmp::min(duration, out);
            }
            out
        };
        tokio::time::sleep(empty_wait_time).await;

        loop {
            let now = Instant::now();
            let next_user_action = cleanup(
                now,
                &self.user.0,
                CACHE_DURATION,
                |v| v.last_written_to_db,
            ).await;
            let next_callback_action = if let CallbackCacheDuration::Enabled(duration)
                = config.auth.callback.cache_duration
            {
                cleanup(now, &self.callback.map, duration, |v| v.timestamp).await
            } else {
                None
            };

            // We will wait until the next entry in the hashmap gets stale, but
            // at least 30s to not do cleanup too often. In case there are no
            // entries currently, it will also retry in 30s. But we will wait
            // at most as long as we would do for an empty cache.
            let next_action = [next_user_action, next_callback_action].into_iter()
                .filter_map(|x| x)
                .min();
            let wait_duration = std::cmp::min(
                std::cmp::max(
                    next_action.map(|i| i.saturating_duration_since(now))
                        .unwrap_or(empty_wait_time),
                    Duration::from_secs(30),
                ),
                empty_wait_time,
            );
            tokio::time::sleep(wait_duration).await;
        }
    }
}

const CACHE_DURATION: Duration = Duration::from_secs(60 * 10);

#[derive(Clone)]
struct UserCacheEntry {
    display_name: String,
    email: Option<String>,
    roles: HashSet<String>,
    user_role: String,
    user_realm_handle: Option<String>,
    last_written_to_db: Instant,
}

/// Cache to remember what users we have seen. Its only purpose is to make
/// writes to the `users` table less frequent. The data from this cache must
/// not be used in any other way.
///
/// This works fine in multi-node setups: each node just has its local cache and
/// prevents some DB writes. But as this data is never used otherwise, we don't
/// run into data inconsistency problems.
pub(crate) struct UserCache(HashMap<String, UserCacheEntry>);

impl UserCache {
    fn new() -> Self {
        Self(HashMap::new())
    }

    pub(crate) async fn upsert_user_info(&self, user: &super::User, db: &Client) {
        match self.0.entry_async(user.username.clone()).await {
            Entry::Occupied(mut occupied) => {
                let entry = occupied.get();
                let needs_update = entry.last_written_to_db.elapsed() > CACHE_DURATION
                    || entry.display_name != user.display_name
                    || entry.email != user.email
                    || entry.roles != user.roles
                    || entry.user_role != user.user_role
                    || entry.user_realm_handle != user.user_realm_handle;

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
                    vacant.insert_entry(UserCacheEntry {
                        display_name: user.display_name.clone(),
                        email: user.email.clone(),
                        roles: user.roles.clone(),
                        user_role: user.user_role.clone(),
                        user_realm_handle: user.user_realm_handle.clone(),
                        last_written_to_db: Instant::now(),
                    });
                }
            },
        }
    }

    async fn write_to_db(user: &super::User, db: &Client) -> Result<(), ()> {
        let sql = "\
            insert into users (username, display_name, email, user_role, \
                user_realm_handle, last_seen) \
            values ($1, $2, $3, $4, $5, now()) \
            on conflict (username) do update set \
                display_name = excluded.display_name, \
                email = excluded.email, \
                user_role = excluded.user_role, \
                user_realm_handle = excluded.user_realm_handle, \
                last_seen = excluded.last_seen \
        ";
        let res = db.execute(sql, &[
            &user.username,
            &user.display_name,
            &user.email,
            &user.user_role,
            &user.user_realm_handle,
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


// ---------------------------------------------------------------------------

#[derive(PartialEq, Eq, Clone)]
struct AuthCallbackCacheKey(HeaderMap);

impl Hash for AuthCallbackCacheKey {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        // Sigh, unfortunately this requires us to sort the headers in order to
        // get the same hash for the same set of headers. Well, there might be
        // some clever ways to avoid that, but the `Hasher` trait is quite
        // limited and does not allow these clever tricks, at least not without
        // basically writing your own hashing logic.
        let mut keys = self.0.keys().collect::<Vec<_>>();
        keys.sort_by_key(|hn| hn.as_str());

        for key in keys {
            for value in self.0.get_all(key) {
                key.hash(state);
                b": ".hash(state);
                value.hash(state);
                state.write_u8(b'\n');
            }
        }
    }
}

#[derive(Clone)]
struct AuthCallbackCacheEntry {
    user: Option<User>,
    timestamp: Instant,
}


/// Cache for `auth-callback` calls.
pub(crate) struct AuthCallbackCache {
    map: HashMap<AuthCallbackCacheKey, AuthCallbackCacheEntry>,
    // Metrics
    hits: Counter,
    misses: Counter,
}

impl AuthCallbackCache {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            hits: Counter::default(),
            misses: Counter::default(),
        }
    }

    pub(crate) fn hits(&self) -> &Counter {
        &self.hits
    }

    pub(crate) fn misses(&self) -> &Counter {
        &self.misses
    }
    pub(crate) fn size(&self) -> usize {
        self.map.len()
    }

    pub(super) async fn get(
        &self,
        key: &HeaderMap,
        cache_duration: Duration,
    ) -> Option<Option<User>> {
        // TODO: this `clone` should not be necessary. It can be removed with
        // `#[repr(transparent)]` and an `unsafe`, but I don't want to just
        // throw around `unsafe` here.
        let out = self.map.get_async(&AuthCallbackCacheKey(key.clone()))
            .await
            .filter(|e| e.get().timestamp.elapsed() < cache_duration)
            .map(|e| e.get().user.clone());

        match out.is_some() {
            true => self.hits.inc(),
            false => self.misses.inc(),
        };

        out
    }

    pub(super) async fn insert(&self, key: HeaderMap, user: Option<User>) {
        self.map.entry_async(AuthCallbackCacheKey(key))
            .await
            .insert_entry(AuthCallbackCacheEntry {
                user,
                timestamp: Instant::now(),
            });
    }
}
