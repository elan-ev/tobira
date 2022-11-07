use hyper::StatusCode;

use super::Response;


pub(crate) fn service_unavailable() -> Response {
    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .body("Server error: service unavailable. Potentially try again later.".into())
        .unwrap()
}

pub(crate) fn bad_request(msg: Option<&str>) -> Response {
    let body = match msg {
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
