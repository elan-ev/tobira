use std::fmt;

use base64::Engine;
use bstr::ByteSlice;
use cookie::Cookie;
use hyper::{HeaderMap, header};
use postgres_types::ToSql;
use secrecy::{ExposeSecret, SecretBox};
use std::time::Duration;
use tokio_postgres::Error as PgError;

use crate::{db::Db, prelude::*};
use super::{SESSION_COOKIE, base64encode};


/// We use 18 bytes = 144bits of entropy. Most guides recommend using at least
/// 64 bits. 128 bits is more than enough, but we round up to have a number of
/// bytes that can perfectly be encoded as base64 (a multiple of 6).
const LENGTH: usize = 18;

/// A session ID (random bytes).
pub(crate) struct SessionId(pub(crate) SecretBox<[u8; LENGTH]>);

impl SessionId {
    /// Creates a new, random session ID.
    pub(crate) fn new() -> Self {
        Self(crate::util::gen_random_bytes_crypto())
    }

    /// Tries to read the session ID from the session cookie. Returns `None` if
    /// there exists no such cookie, if its value has not the right length or
    /// if it cannot be decoded as base64.
    pub(crate) fn from_headers(headers: &HeaderMap) -> Option<Self> {
        headers.get(header::COOKIE).into_iter()
            // Split into list of cookies
            .flat_map(|value| value.as_bytes().split(|&b| b == b';').map(|s| s.trim()))

            // Get the first one with fitting name
            .find(|s| s.starts_with(SESSION_COOKIE.as_bytes()))

            // Get the cookies' value
            .and_then(|s| s.get(SESSION_COOKIE.len() + 1..))

            // Base64 decode value
            .and_then(|v| {
                if v.len() != LENGTH / 3 * 4 {
                    return None;
                }

                let mut bytes = [0; LENGTH];
                base64::engine::general_purpose::URL_SAFE.decode_slice(v, &mut bytes).ok()?;
                Some(Self(SecretBox::new(Box::new(bytes))))
            })
    }

    /// Returns a cookie for a `set-cookie` header in order to store the session
    /// ID in the client's cookie jar.
    pub(crate) fn set_cookie(&self, session_duration: Duration) -> Cookie<'_> {
        Cookie::build((SESSION_COOKIE, base64encode(self.0.expose_secret())))

            // Only send via HTTPS as it contains sensitive information.
            .secure(true)

            // Don't allow JS to read the cookie.
            .http_only(true)

            // Don't send the cookie on third party requests (e.g. if something
            // from Tobira is embedded on another page). However, this is "lax"
            // not "strict" because (a) users following a link to Tobira should
            // be immediately logged in and (b) GET requests never modify
            // anything, so something like "link to `/realm/delete`" is not a
            // thing for Tobira.
            .same_site(cookie::SameSite::Lax)

            // Expire the cookie at the appropriate time
            .max_age(
                // The `cookie` crate unfortunately uses `time::Duration`
                // which uses an `i64` instead of a `u64` to represent
                // the seconds part of the duration.
                // This conversion should never fail, though,
                // because we parse the duration as `u32` anyway.
                session_duration.try_into().expect("session duration too large"),
            )
            .build()
    }

    /// Returns a cookie for a `set-cookie` header that removes the session ID
    /// from the client's cookie jar.
    pub(crate) fn unset_cookie() -> Cookie<'static> {
        Cookie::build((SESSION_COOKIE, ""))
            .max_age(time::Duration::ZERO)
            .secure(true)
            .http_only(true)
            .same_site(cookie::SameSite::Lax)
            .build()
    }

    /// Tries to remove this session from the DB. Returns `Some(username)` if
    /// the session existed and `None` if it did not exist.
    pub(crate) async fn remove_from_db(&self, db: &Db) -> Result<Option<String>, PgError> {
        db.query_opt("delete from user_sessions where id = $1 returning username", &[self])
            .await?
            .map(|row| row.get(0))
            .pipe(Ok)
    }
}

impl ToSql for SessionId {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut bytes::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        (self.0.expose_secret() as &[u8]).to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <&[u8] as ToSql>::accepts(ty)
    }

    postgres_types::to_sql_checked!();
}

impl fmt::Debug for SessionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.pad("SessionId(REDACTED)")
    }
}
