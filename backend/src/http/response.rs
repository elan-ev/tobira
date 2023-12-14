use hyper::StatusCode;

use super::Response;


pub(crate) fn service_unavailable() -> Response {
    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .body("Server error: service unavailable. Potentially try again later.".into())
        .unwrap()
}

pub(crate) fn bad_request<'a>(msg: impl Into<Option<&'a str>>) -> Response {
    let body = match msg.into() {
        Some(s) => hyper::Body::from(s.to_owned()),
        None => hyper::Body::from("Bad request"),
    };
    Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .body(body)
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

pub(crate) fn bad_gateway() -> Response {
    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .body("Bad gateway: broken auth callback".into())
        .unwrap()
}
