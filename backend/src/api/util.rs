use std::collections::HashMap;

use bytes::BytesMut;
use fallible_iterator::FallibleIterator;
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




#[derive(Debug)]
pub struct TranslatedString(pub(crate) HashMap<String, String>);

impl ToSql for TranslatedString {
    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        let values = self.0.iter().map(|(k, v)| (&**k, Some(&**v)));
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


#[juniper::graphql_scalar(
    name = "TranslatedString",
    description = "A string in different languages",
)]
impl<S> GraphQLScalar for TranslatedString
where
    S: juniper::ScalarValue + From<&str>
{
    fn resolve(&self) -> juniper::Value {
        use juniper::Value;

        self.0.iter()
            .map(|(k, v)| (k, juniper::Value::scalar(v.clone())))
            .collect::<juniper::Object<S>>()
            .pipe(Value::Object)
    }

    fn from_input_value(value: &juniper::InputValue) -> Option<Self> {
        // I did not want to waste time implementing this now, given that we
        // likely never use it.
        let _ = value;
        todo!("TranslatedString cannot be used as input value yet")
    }

    fn from_str<'a>(value: juniper::ScalarToken<'a>) -> juniper::ParseScalarResult<'a, S> {
        // See `from_input_value`
        let _ = value;
        todo!()
    }
}
