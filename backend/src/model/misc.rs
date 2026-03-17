use juniper::{GraphQLScalar, InputValue, ScalarValue};


/// A byte range, encoded as two hex numbers separated by `-`.
#[derive(Debug, Clone, Copy, GraphQLScalar)]
#[graphql(parse_token(String))]
pub struct ByteSpan {
    pub start: u32,
    pub len: u32,
}

impl ByteSpan {
    fn to_output<S: ScalarValue>(&self) -> juniper::Value<S> {
        juniper::Value::scalar(format!("{:x}-{:x}", self.start, self.len))
    }

    fn from_input<S: ScalarValue>(_input: &InputValue<S>) -> Result<Self, String> {
        unimplemented!("not used right now")
    }
}

impl From<&meilisearch_sdk::search::MatchRange> for ByteSpan {
    fn from(range: &meilisearch_sdk::search::MatchRange) -> Self {
        Self {
            start: range.start as u32,
            len: range.length as u32,
        }
    }
}
