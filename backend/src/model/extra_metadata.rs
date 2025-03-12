use std::collections::HashMap;

use bytes::BytesMut;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use juniper::{GraphQLScalar, InputValue, ScalarValue};

use crate::prelude::*;



/// Represents extra metadata in the DB. Is a map from "namespace" to a
/// `string -> string array` map.
///
/// Each namespace key is a URL pointing to an XML namespace definition OR
/// `"dcterms"` for the dc terms (most common namespace). The value for each
/// namespace is a simple string-key map where each value is an array of string
/// values.
#[derive(Clone, Debug, Serialize, Deserialize, Default, GraphQLScalar)]
#[cfg_attr(test, derive(PartialEq, Eq))]
#[graphql(
    description = "Arbitrary metadata for events/series. Serialized as JSON object.",
    with = Self,
    parse_token(String),
)]
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

impl ExtraMetadata {
    fn to_output<S: ScalarValue>(&self) -> juniper::Value<S> {
        use juniper::Value;

        std::iter::once(("dcterms", &self.dcterms))
            .chain(self.extended.iter().map(|(k, v)| (&**k, v)))
            .map(|(k, v)| {
                let value = v.iter()
                    .map(|(k, v)| {
                        let elements = v.iter()
                            .map(|s| Value::Scalar(S::from(s.clone())))
                            .collect();
                        (k, Value::List(elements))
                    })
                    .collect::<juniper::Object<S>>();

                (k, Value::Object(value))
            })
            .collect::<juniper::Object<S>>()
            .pipe(Value::Object)
    }

    fn from_input<S: ScalarValue>(input: &InputValue<S>) -> Result<Self, String> {
        // I did not want to waste time implementing this now, given that we
        // likely never use it.
        let _ = input;
        todo!("ExtraMetadata cannot be used as input value yet")
    }
}

