use bytes::Bytes;
use hyper::StatusCode;

use crate::prelude::*;
use super::Response;


pub(crate) fn service_unavailable() -> Response {
    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .body("Server error: service unavailable. Potentially try again later.".into())
        .unwrap()
}

pub(crate) fn bad_request(msg: impl Into<Bytes>) -> Response {
    Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .body(msg.into().into())
        .unwrap()
}

pub(crate) fn internal_server_error() -> Response {
    Response::builder()
        .status(StatusCode::INTERNAL_SERVER_ERROR)
        .body("Internal server error".into())
        .unwrap()
}

pub(crate) fn not_found() -> Response {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body("Not found".into())
        .unwrap()
}

/// Returns "401 Unauthorized", but that's a misnomer as the semantics of this
/// are "unauthenticated".
pub(crate) fn unauthorized() -> Response {
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .body("Not authenticated".into())
        .unwrap()
}

/// Returns "403 Forbidden".
pub(crate) fn forbidden() -> Response {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .body("403 Forbidden".into())
        .unwrap()
}
