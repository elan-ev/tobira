//! Items that define the domain data model and logic.
//!
//! There are many types that represent "user-visible data", i.e. data that
//! directly models the application domain and not technical helpers (like a DB
//! pool). These are big high level types like `Event`, but also things like
//! `EventTrack` and `TranslatedString`. These commonly don't neatly fit into
//! either of `db`, `api` or any other submodule as they are used in multiple
//! situations (loading from DB, exposing via API, ...).

mod key;
mod translated_string;

pub(crate) use self::{
    key::Key,
    translated_string::{LangKey, TranslatedString},
};
