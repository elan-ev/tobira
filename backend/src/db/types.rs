use bytes::BytesMut;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};


/// Represents the `event_track` type defined in `5-events.sql`.
#[derive(Debug, FromSql, ToSql)]
#[postgres(name = "event_track")]
pub struct EventTrack {
    pub uri: String,
    pub flavor: String,
    pub mimetype: Option<String>,
    pub resolution: Option<[i32; 2]>,
}


/// Our primary database ID type, which we call "key". In the database, it's a
/// `bigint` (`i64`), but we have a separate Rust type for it for several
/// reasons. Implements `ToSql` and `FromSql` by casting to/from `i64`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub(crate) struct Key(pub(crate) u64);

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
