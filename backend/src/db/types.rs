use std::{fmt, collections::HashMap};

use bytes::BytesMut;
use juniper::GraphQLEnum;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};


/// Our primary database ID type, which we call "key". In the database, it's a
/// `bigint` (`i64`), but we have a separate Rust type for it for several
/// reasons. Implements `ToSql` and `FromSql` by casting to/from `i64`.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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

impl fmt::Debug for Key {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut buf = [0; 11];
        write!(f, "Key({} :: {})", self.0 as i64, self.to_base64(&mut buf))
    }
}


/// Represents the `event_track` type defined in `5-events.sql`.
#[derive(Debug, FromSql, ToSql)]
#[postgres(name = "event_track")]
pub struct EventTrack {
    pub uri: String,
    pub flavor: String,
    pub mimetype: Option<String>,
    pub resolution: Option<[i32; 2]>,
}

/// Represents the `series_state` type defined in `04-series.sql`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "series_state")]
#[graphql(description = "Represents the different states a series can be in during its lifecycle")]
pub enum SeriesState {
    #[postgres(name = "ready")]
    Ready,
    #[postgres(name = "waiting")]
    Waiting,
}


/// Represents extra metadata in the DB. Is a map from "namespace" to a
/// `string -> string array` map.
///
/// Each namespace key is a URL pointing to an XML namespace definition OR
/// `"dcterms"` for the dc terms (most common namespace). The value for each
/// namespace is a simple string-key map where each value is an array of string
/// values.
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ExtraMetadata {
    /// Metadata of the dcterms
    #[serde(default)]
    pub(crate) dcterms: MetadataMap,

    /// Extended metadata.
    #[serde(flatten)]
    pub(crate) extended: HashMap<String, MetadataMap>,
}

type MetadataMap = HashMap<String, Vec<String>>;

impl ToSql for ExtraMetadata {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        serde_json::to_value(self)
            .expect("failed to convert `ExtraMetadata` to JSON value")
            .to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <serde_json::Value as ToSql>::accepts(ty)
    }

    postgres_types::to_sql_checked!();
}

impl<'a> FromSql<'a> for ExtraMetadata {
    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        serde_json::from_value(<_>::from_sql(ty, raw)?).map_err(Into::into)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        <serde_json::Value as FromSql>::accepts(ty)
    }
}
