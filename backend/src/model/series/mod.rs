use juniper::GraphQLEnum;
use postgres_types::{FromSql, ToSql};


/// Represents the `series_state` type defined in `04-series.sql`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "series_state")]
#[graphql(description = "Represents the different states a series can be in during its lifecycle")]
pub(crate) enum SeriesState {
    #[postgres(name = "ready")]
    Ready,
    #[postgres(name = "waiting")]
    Waiting,
}
