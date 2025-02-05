use bincode::Options;
use juniper::{GraphQLScalar, InputValue, ScalarValue};
use serde::{Deserialize, Serialize};

use crate::{
    api::{
        Id,
        Context,
        err::{self, ApiResult},
        model::{
            event::AuthorizedEvent,
            series::Series,
            realm::Realm,
            playlist::AuthorizedPlaylist,
            search::{SearchEvent, SearchRealm, SearchSeries},
        },
    },
    prelude::*,
    search::Playlist as SearchPlaylist,
};


/// A node with a globally unique ID. Mostly useful for relay.
#[juniper::graphql_interface(
    Context = Context,
    for = [
        AuthorizedEvent,
        AuthorizedPlaylist,
        Realm,
        Series,
        SearchEvent,
        SearchRealm,
        SearchSeries,
        SearchPlaylist,
    ]
)]
pub(crate) trait Node {
    fn id(&self) -> Id;
}

/// Marker type (mostly to be used in unions) to signal that the user is not
/// allowed to access some data.
///
/// This is used instead of GraphQL errors in places where we easily want to
/// deal with the "not allowed" case.
pub(crate) struct NotAllowed;

super::util::impl_object_with_dummy_field!(NotAllowed);


/// Opaque cursor for pagination. Serializes as string.
///
/// Ideally, this would be generic over something `Serialize + Deserialize`.
/// However, junipers `graphql_scalar` macro doesn't work with generics
/// (sigh). So it's easier to just eagerly create the base64 string in `new`
/// and `deserialize`.
///
/// The actual cursor is a base64 encoded string. The encoded bytes are the
/// serialization format from `bincode`, a compact binary serializer. Of course
/// we could also have serialized it as JSON and base64 encoded it then, but
/// that would be a waste of network bandwidth.
#[derive(Debug, Clone, GraphQLScalar)]
#[graphql(
    description = "An opaque cursor used for pagination",
    parse_token(String),
)]
pub(crate) struct Cursor(String);

impl Cursor {
    pub(crate) fn new(data: impl Serialize) -> Self {
        let mut b64writer = base64::write::EncoderStringWriter::new(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        );
        bincode::DefaultOptions::new().serialize_into(&mut b64writer, &data)
            .unwrap_or_else(|e| unreachable!("bincode serialize failed without size limit: {}", e));
        Self(b64writer.into_inner())
    }

    pub(crate) fn deserialize<T>(&self) -> ApiResult<T>
    where
        for<'de> T: Deserialize<'de>,
    {
        let mut bytes = self.0.as_bytes();
        let b64reader = base64::read::DecoderReader::new(
            &mut bytes,
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        );
        bincode::DefaultOptions::new()
            .deserialize_from(b64reader)
            .map_err(|e| err::invalid_input!("given cursor is invalid: {}", e))
    }

    fn to_output<S: ScalarValue>(&self) -> juniper::Value<S> {
        juniper::Value::scalar(self.0.clone())
    }

    fn from_input<S: ScalarValue>(input: &InputValue<S>) -> Result<Self, String> {
        let s = input.as_string_value().ok_or("expected string")?;
        Ok(Self(s.into()))
    }
}
