use hyper::{Body, Method, StatusCode};

use tobira_util::prelude::*;
use super::Response;


/// These are all static files we serve, including JS, fonts and images.
#[derive(rust_embed::RustEmbed)]
#[folder = "../../frontend/build"]
pub(crate) struct Assets;

const INDEX_FILE: &str = "index.html";

impl Assets {
    /// Responds with the asset identified by the given path. If there exists no
    /// asset with `path` or `path` is `INDEX_FILE`, `None` is returned.
    pub(crate) async fn serve(path: &str) -> Option<Response> {
        // The `index.html` here is not intended to be served directly. It is
        // modified and sent on many other routes.
        if path == INDEX_FILE {
            return None;
        }

        let body = Body::from(Assets::get(path)?);
        let mime_guess = mime_guess::from_path(path).first();
        let mut builder = Response::builder();
        if let Some(mime) = mime_guess {
            builder = builder.header("Content-Type", mime.to_string())
        }

        // TODO: content length
        // TODO: lots of other headers maybe

        Some(builder.body(body).expect("bug: invalid response"))
    }
}

/// Serves the main entry point of the application. This is replied to `/` and
/// other "public routes", like `/r/lectures`. Basically everywhere where the
/// user is supposed to see the website.
pub(crate) async fn serve_index() -> Response {
    let html = Assets::get(INDEX_FILE).unwrap();

    // TODO: include useful data into the HTML file

    let body = Body::from(html);
    let mut builder = Response::builder();
    builder = builder.header("Content-Type", "text/html; charset=UTF-8");

    // TODO: content length
    // TODO: lots of other headers maybe

    builder.body(body).expect("bug: invalid response")
}

/// Replies with a 404 Not Found.
pub(crate) async fn reply_404(method: &Method, path: &str) -> Response {
    debug!("Responding with 404 to {:?} {}", method, path);

    // We simply send the normal index and let the frontend router determinate
    // this is a 404. That way, our 404 page looks like the main page and users
    // are not confused. And it's easier to return to the normal page.
    //
    // TODO: I am somewhat uneasy about this code assuming the router of the
    // frontend is the same as the backend router. Maybe we want to indicate to
    // the frontend explicitly to show a 404 page? However, without redirecting
    // to like `/404` because that's annoying for users.
    let html = Assets::get(INDEX_FILE).unwrap();
    let body = Body::from(html);

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/html; charset=UTF-8")
        .body(body)
        .unwrap()
}
