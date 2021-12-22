use bincode::Options;
use serde::{Deserialize, Serialize};

use crate::{
    api::{
        Id, Context,
        err::{self, ApiResult},
        model::{event::Event, series::Series, realm::Realm},
    },
};


/// A node with a globally unique ID. Mostly useful for relay.
#[juniper::graphql_interface(Context = Context, for = [Event, Realm, Series])]
pub(crate) trait Node {
    fn id(&self) -> Id;
}

#[derive(Debug, Clone, juniper::GraphQLObject)]
pub(crate) struct PageInfo {
    pub(crate) has_next_page: bool,
    pub(crate) has_previous_page: bool,

    // TODO: the spec says these shouldn't be optional, but that makes no sense.
    // Figure this out for good!
    //
    // I asked here: https://stackoverflow.com/q/70448483/2408867
    pub(crate) start_cursor: Option<Cursor>,
    pub(crate) end_cursor: Option<Cursor>,
}

/// Opaque cursor for pagination. Serializes as string.
///
/// Since `PageInfo` and thus `Cursor` needs to be a global type (tho I want to
/// change that), the idea is that you create a cursor just by passing
/// something serializable to `new`. When you want to read the cursor's data,
/// use `deserialize`.
///
/// The actual cursor is a base64 encoded string. The encoded bytes are the
/// serialization format from `bincode`, a compact binary serializer. Of course
/// we could also have serialized it as JSON and base64 encoded it then, but
/// that would be a waste of network bandwidth.
#[derive(Debug, Clone)]
pub(crate) struct Cursor(String);

impl Cursor {
    pub(crate) fn new(data: impl Serialize) -> Self {
        let mut b64writer = base64::write::EncoderStringWriter::new(base64::URL_SAFE);
        bincode::DefaultOptions::new().serialize_into(&mut b64writer, &data)
            .unwrap_or_else(|e| unreachable!("bincode serialize failed without size limit: {}", e));
        Self(b64writer.into_inner())
    }

    pub(crate) fn deserialize<T>(&self) -> ApiResult<T>
    where
        for<'de> T: Deserialize<'de>,
    {
        let mut bytes = self.0.as_bytes();
        let b64reader = base64::read::DecoderReader::new(&mut bytes, base64::URL_SAFE);
        bincode::DefaultOptions::new()
            .deserialize_from(b64reader)
            .map_err(|e| err::invalid_input!("given cursor is invalid: {}", e))
    }
}

#[juniper::graphql_scalar(
    name = "Cursor",
    description = "An opaque cursor used for pagination",
)]
impl<S> GraphQLScalar for Cursor
where
    S: juniper::ScalarValue,
{
    fn resolve(&self) -> juniper::Value {
        juniper::Value::scalar(self.0.clone())
    }

    fn from_input_value(value: &juniper::InputValue) -> Option<Self> {
        value.as_string_value().map(|s| Self(s.into()))
    }

    fn from_str<'a>(value: juniper::ScalarToken<'a>) -> juniper::ParseScalarResult<'a, S> {
        <String as juniper::ParseScalarValue<S>>::from_str(value)
    }
}
