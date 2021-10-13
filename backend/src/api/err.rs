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
}

impl ApiErrorKind {
    fn kind_str(&self) -> &str {
        // This has to be kept in sync with the `ErrorKind` in `relay/errors.ts`!
        match self {
            Self::InvalidInput => "INVALID_INPUT",
            Self::NotAuthorized => "NOT_AUTHORIZED",
            Self::InternalServerError => "INTERNAL_SERVER_ERROR",
        }
    }

    fn message_prefix(&self) -> &str {
        match self {
            Self::InvalidInput => "Invalid input",
            Self::NotAuthorized => "Not authorized",
            Self::InternalServerError => "Internal server error",
        }
    }
}

impl From<tokio_postgres::Error> for ApiError {
    fn from(src: tokio_postgres::Error) -> Self {
        Self {
            // TODO: can this leak sensitive information?
            msg: format!("DB error: {}", src),
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

macro_rules! internal_server_err {
    ($($t:tt)+) => { $crate::api::err::api_err!(InternalServerError, $($t)*) };
}

pub(crate) use api_err;
pub(crate) use invalid_input;
pub(crate) use internal_server_err;
