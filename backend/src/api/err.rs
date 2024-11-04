//! API error handling.
//!
//! We define our own error to use for all resolvers. It has `From` impls to be
//! created from other common errors that occur (e.g. DB errors). This module
//! also offers a couple macros to easily create an error.
//!
//! The error contains information that helps the frontend show a good error
//! message. We have a very coarse "error kind", but also an optional
//! "key". The latter is directly used for error messages in the frontend.

use juniper::{FieldError, IntoFieldError, ScalarValue, graphql_value};

use crate::prelude::*;


pub(crate) type ApiResult<T> = Result<T, ApiError>;

pub(crate) struct ApiError {
    pub(crate) msg: String,
    pub(crate) kind: ApiErrorKind,
    pub(crate) key: Option<&'static str>,
}

pub(crate) enum ApiErrorKind {
    /// The arguments passed to an endpoint are invalid somehow.
    InvalidInput,

    /// The API request is not sufficiently authorized.
    NotAuthorized,

    /// Some server error out of control of the API user.
    InternalServerError,

    /// Communication error with Opencast.
    OpencastUnavailable,
}

impl ApiErrorKind {
    fn kind_str(&self) -> &str {
        // This has to be kept in sync with the `ErrorKind` in `relay/errors.ts`!
        match self {
            Self::InvalidInput => "INVALID_INPUT",
            Self::NotAuthorized => "NOT_AUTHORIZED",
            Self::InternalServerError => "INTERNAL_SERVER_ERROR",
            Self::OpencastUnavailable => "OPENCAST_UNAVAILABLE",
        }
    }

    fn message_prefix(&self) -> &str {
        match self {
            Self::InvalidInput => "Invalid input",
            Self::NotAuthorized => "Not authorized",
            Self::InternalServerError => "Internal server error",
            Self::OpencastUnavailable => "Opencast unavailable",
        }
    }
}

impl From<tokio_postgres::Error> for ApiError {
    fn from(src: tokio_postgres::Error) -> Self {
        // Logging the error here is not ideal but probably totally fine for us.
        // At this point, it's very very likely that the error is sent back to
        // the user. And this is the last time we can get detailed information
        // about it.
        error!("DB Error when executing query: {src}");
        debug!("Detailed error: {src:#?}");

        Self {
            // TODO: can this leak sensitive information?
            msg: format!("DB error: {}", src),
            kind: ApiErrorKind::InternalServerError,
            key: None,
        }
    }
}

impl From<meilisearch_sdk::errors::Error> for ApiError {
    fn from(src: meilisearch_sdk::errors::Error) -> Self {
        // Logging the error here is not _ideal_ but it's probably totally fine
        // for us.
        error!("Meili error: {}", src);
        debug!("Detailed error: {:#?}", src);
        Self {
            msg: format!("Error with Meili: {src}"),
            kind: ApiErrorKind::InternalServerError,
            key: None,
        }
    }
}

impl<S: ScalarValue> IntoFieldError<S> for ApiError {
    fn into_field_error(self) -> juniper::FieldError<S> {
        let msg = format!("{}: {}", self.kind.message_prefix(), self.msg);
        let ext = if let Some(key) = self.key {
            graphql_value!({
                "kind": (self.kind.kind_str()),
                "key": key,
            })
        } else {
            graphql_value!({
                "kind": (self.kind.kind_str()),
            })
        };

        FieldError::new(msg, ext)
    }
}


// ===== Helper macros to easily create errors ==================================================

/// Creates an `ApiError` with a `format!` like syntax.
macro_rules! api_err {
    ($kind:ident, key = $key:literal, $fmt:literal $(, $arg:expr)* $(,)?) => {
        $crate::api::err::ApiError {
            msg: format!($fmt $(, $arg)*),
            kind: $crate::api::err::ApiErrorKind::$kind,
            key: Some($key.into()),
        }
    };
    ($kind:ident, $fmt:literal $(, $arg:expr)* $(,)?) => {
        $crate::api::err::ApiError {
            msg: format!($fmt $(, $arg)*),
            kind: $crate::api::err::ApiErrorKind::$kind,
            key: None,
        }
    };
}

macro_rules! invalid_input {
    ($($t:tt)+) => { $crate::api::err::api_err!(InvalidInput, $($t)*) };
}

macro_rules! not_authorized {
    ($($t:tt)+) => { $crate::api::err::api_err!(NotAuthorized, $($t)*) };
}

macro_rules! internal_server_error {
    ($($t:tt)+) => { $crate::api::err::api_err!(InternalServerError, $($t)*) };
}

macro_rules! opencast_unavailable {
    ($($t:tt)+) => { $crate::api::err::api_err!(OpencastUnavailable, $($t)*) };
}

pub(crate) use api_err;
pub(crate) use invalid_input;
pub(crate) use not_authorized;
pub(crate) use internal_server_error;
pub(crate) use opencast_unavailable;


// ===== Helper macro to inspect DbError ==================================================

/// Helps you map some special DB errors to specific API errors (instead of a
/// generic "internal server error"). Usage:
///
/// ```
/// // `result` needs to be `Result<T, tokio_postgres::error::Error>`.
/// map_db_err!(result, {
///     if constraint == "valid_path" => invalid_input!("bad user!"),
///     if /* field */ == /* value */ => /* expression returning ApiError */,
///     // ...
/// })
/// ```
///
/// The macro returns `Result<T, ApiError>`.
macro_rules! map_db_err {
    ($result:expr, { $(
        if $field:ident == $value:expr => $then:expr
    ),* $(,)? }) => {
        match $result {
            Ok(v) => Ok(v),
            Err(e) => {
                if let Some(db_error) = e.as_db_error() {
                    let new_err: $crate::api::err::ApiError = if false { unreachable!() }
                    $(
                        else if db_error.$field()
                            == $crate::api::err::map_db_err!(@wrap $field $value)
                        { $then.into() }
                    )*
                    else { e.into() };
                    Err(new_err)
                } else {
                    Err(e.into())
                }
            }
        }
    };
    (@wrap constraint $value:expr) => { Some($value) };
}

pub(crate) use map_db_err;
