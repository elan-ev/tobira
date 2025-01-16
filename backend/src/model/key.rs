use std::fmt;

use bytes::BytesMut;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

use crate::util::{BASE64_DIGITS, base64_decode};



/// Our primary ID type, which we call "key". In the database, it's a
/// `bigint` (`i64`), but we have a separate Rust type for it for several
/// reasons. Implements `ToSql` and `FromSql` by casting to/from `i64`.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub(crate) struct Key(pub(crate) u64);

impl Key {
    pub(crate) fn from_base64(s: &str) -> Option<Self> {
        if s.len() != 11 {
            return None;
        }

        decode_base64(s.as_bytes())
    }

    pub(crate) fn to_base64<'a>(&self, out: &'a mut [u8; 11]) -> &'a str {
        // Base64 encoding. After this loop, `n` is always 0, because `u64::MAX`
        // divided by 64 eleven times is 0.
        let mut n = self.0;
        for i in (0..out.len()).rev() {
            out[i] = BASE64_DIGITS[(n % 64) as usize];
            n /= 64;
        }
        debug_assert!(n == 0);

        std::str::from_utf8(out)
            .expect("bug: base64 did produce non-ASCII character")
    }
}

fn decode_base64(src: &[u8]) -> Option<Key> {
    let src: [u8; 11] = src.try_into().ok()?;

    // Make sure the string doesn't decode to a number > `u64::MAX`. Luckily,
    // checking that is easy. `u64::MAX` encodes to `P__________`, so the next
    // higher number would carry through and make the highest digit a `Q`. So we
    // just make sure the first digit is between 'A' and 'P'.
    if src[0] > b'P' || src[0] < b'A' {
        return None;
    }

    src.iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| base64_decode(d).map(|n| n as u64 * 64u64.pow(i as u32)))
        .sum::<Option<u64>>()
        .map(Key)
}

impl ToSql for Key {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        (self.0 as i64).to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <i64 as ToSql>::accepts(ty)
    }

    postgres_types::to_sql_checked!();
}

impl<'a> FromSql<'a> for Key {
    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        i64::from_sql(ty, raw).map(|i| Key(i as u64))
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <i64 as FromSql>::accepts(ty)
    }
}

impl fmt::Debug for Key {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut buf = [0; 11];
        write!(f, "Key({} :: {})", self.0 as i64, self.to_base64(&mut buf))
    }
}
