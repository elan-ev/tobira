//! Items that define the domain data model and logic.
//!
//! There are many types that represent "user-visible data", i.e. data that
//! directly models the application domain and not technical helpers (like a DB
//! pool). These are big high level types like `Event`, but also things like
//! `EventTrack` and `TranslatedString`. These commonly don't neatly fit into
//! either of `db`, `api` or any other submodule as they are used in multiple
//! situations (loading from DB, exposing via API, ...).

use std::{fmt, ops::Deref};
use juniper::{GraphQLObject, GraphQLScalar};
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

mod event;
mod extra_metadata;
mod key;
mod series;
mod translated_string;

pub(crate) use self::{
    extra_metadata::ExtraMetadata,
    key::Key,
    event::{SearchThumbnailInfo, ThumbnailInfo},
    series::SeriesState,
    translated_string::{LangKey, TranslatedString},
};

#[derive(Debug, GraphQLObject, Clone)]
pub(crate) struct ThumbnailStack {
    pub(crate) thumbnails: Vec<ThumbnailInfo>,
}

/// Wrapper around Opencast IDs.
/// Should prevent using a regular String where an Opencast ID is expected.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, FromSql, ToSql, GraphQLScalar)]
#[postgres(transparent)]
#[graphql(transparent)]
pub(crate) struct OpencastId(String);

impl From<String> for OpencastId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl Deref for OpencastId {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for OpencastId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}
