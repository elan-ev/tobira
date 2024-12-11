use std::{collections::HashMap, fmt};

use bytes::BytesMut;
use fallible_iterator::FallibleIterator;
use juniper::{GraphQLScalar, InputValue, ScalarValue};
use postgres_types::{FromSql, ToSql};

use crate::prelude::*;



macro_rules! impl_object_with_dummy_field {
    ($ty:ident) => {
        #[juniper::graphql_object(Context = crate::api::Context)]
        impl $ty {
            /// Unused dummy field for this marker type. GraphQL requires all objects to
            /// have at least one field. Always returns `null`.
            fn dummy() -> Option<bool> {
                None
            }
        }
    };
}

pub(crate) use impl_object_with_dummy_field;




/// A string in different languages.
#[derive(Debug, GraphQLScalar)]
#[graphql(
    where(T: AsRef<str>),
    parse_token(String),
)]
pub struct TranslatedString<T>(pub(crate) HashMap<T, String>);

impl<T: AsRef<str> + fmt::Debug> ToSql for TranslatedString<T> {
    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        let values = self.0.iter().map(|(k, v)| (k.as_ref(), Some(&**v)));
        postgres_protocol::types::hstore_to_sql(values, out)?;
        Ok(postgres_types::IsNull::No)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        ty.name() == "hstore"
    }

    postgres_types::to_sql_checked!();
}

impl<'a> FromSql<'a> for TranslatedString<String> {
    fn from_sql(
        _: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        postgres_protocol::types::hstore_from_sql(raw)?
            .map(|(k, v)| {
                v.map(|v| (k.to_owned(), v.to_owned()))
                    .ok_or("translated label contained null value in hstore".into())
            })
            .collect()
            .map(Self)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        ty.name() == "hstore"
    }
}

impl<T: AsRef<str>> TranslatedString<T> {
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
