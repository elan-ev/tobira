use std::fmt;

use cookie::Cookie;
use postgres_types::ToSql;
use rand::{CryptoRng, RngCore};
use secrecy::{ExposeSecret, Secret};

use super::{SESSION_COOKIE, base64encode};


/// A session ID (random bytes).
///
/// We use 18 bytes = 144bits of entropy. Most guides recommend using at least
/// 64 bits. 128 bits is more than enough, but we round up to have a number of
/// bytes that can perfectly be encoded as base64 (a multiple of 6).
pub(crate) struct SessionId(pub(crate) Secret<[u8; 18]>);

impl SessionId {
    /// Creates a new, random session ID.
    pub(crate) fn new() -> Self {
        // We use this extra function here to make sure we use a
        // cryptographically secure RNG, even after updating to newer `rand`
        // versions. Right now, we use `thread_rng` and it is cryptographically
        // secure. But if the `rand` authors make `thread_rng` return a
        // non-cryptographically secure RNG in future major version(a dangerous
        // API decision in my opinion) and if the Tobira dev updating the
        // library does not check the changelog, then we would have a problem.
        // This explicit `CryptoRng` bound makes sure that such a change would
        // not silently compile.
        fn generate(mut rng: impl RngCore + CryptoRng) -> [u8; 18] {
            let mut bytes = [0; 18];
            rng.fill_bytes(&mut bytes);
            bytes
        }

        Self(Secret::new(generate(rand::thread_rng())))
    }

    pub(crate) fn set_cookie(&self) -> Cookie {
        // TODO: expiration and other cookie stuff!
        Cookie::build(SESSION_COOKIE, base64encode(self.0.expose_secret()))
            .secure(true)
            .http_only(true)
            .finish()
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
