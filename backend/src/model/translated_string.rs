use std::{collections::HashMap, fmt, ops::Deref, str::FromStr};
use bytes::BytesMut;
use fallible_iterator::FallibleIterator;
use juniper::{GraphQLScalar, InputValue, ScalarValue};
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use anyhow::{anyhow, Error};

use crate::prelude::*;


/// A string specified in different languages. Entry 'default' is required.
#[derive(Serialize, Deserialize, Clone, GraphQLScalar)]
#[serde(try_from = "HashMap<LangKey, String>")]
#[graphql(parse_token(String))]
pub(crate) struct TranslatedString(HashMap<LangKey, String>);

impl TranslatedString {
    pub(crate) fn default(&self) -> &str {
        &self.0[&LangKey::Default]
    }

    fn to_output<S: ScalarValue>(&self) -> juniper::Value<S> {
        self.0.iter()
            .map(|(k, v)| (k.as_ref(), juniper::Value::scalar(v.to_owned())))
            .collect::<juniper::Object<S>>()
            .pipe(juniper::Value::Object)
    }

    fn from_input<S: ScalarValue>(input: &InputValue<S>) -> Result<Self, String> {
        // I did not want to waste time implementing this now, given that we
        // likely never use it.
        let _ = input;
        todo!("TranslatedString cannot be used as input value yet")
    }
}

impl Deref for TranslatedString {
    type Target = HashMap<LangKey, String>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl TryFrom<HashMap<LangKey, String>> for TranslatedString {
    type Error = Error;

    fn try_from(map: HashMap<LangKey, String>) -> Result<Self, Self::Error> {
        if !map.contains_key(&LangKey::Default) {
            return Err(anyhow!("Translated string must include 'default' entry."));
        }

        Ok(Self(map))
    }
}

impl fmt::Debug for TranslatedString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("TranslatedString ")?;
        f.debug_map().entries(self.0.iter()).finish()
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Debug, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub(crate) enum LangKey {
    #[serde(alias = "*")]
    Default,
    En,
    De,
    It,
    Fr,
}

impl fmt::Display for LangKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(f)
    }
}

impl AsRef<str> for LangKey {
    fn as_ref(&self) -> &str {
        match self {
            LangKey::Default => "default",
            LangKey::En => "en",
            LangKey::De => "de",
            LangKey::It => "it",
            LangKey::Fr => "fr",
        }
    }
}

impl FromStr for LangKey {
    type Err = serde::de::value::Error;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        Self::deserialize(serde::de::value::BorrowedStrDeserializer::new(s))
    }
}

impl ToSql for TranslatedString {
    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        let values = self.0.iter().map(|(k, v)| (k.as_ref(), Some(v.as_str())));
        postgres_protocol::types::hstore_to_sql(values, out)?;
        Ok(postgres_types::IsNull::No)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        ty.name() == "hstore"
    }

    postgres_types::to_sql_checked!();
}



impl<'a> FromSql<'a> for TranslatedString {
    fn from_sql(
        _: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        let map: HashMap<LangKey, String> = postgres_protocol::types::hstore_from_sql(raw)?
            .map(|(k, v)| {
                let v = v.ok_or("translated label contained null value in hstore")?;
                let k = k.parse()?;
                Ok((k, v.to_owned()))
            })
            .collect()?;

        Ok(map.try_into()?)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        ty.name() == "hstore"
    }
}
