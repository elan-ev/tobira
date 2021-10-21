use hyper::{Body, StatusCode};

use crate::{db, http::{self, Context, Request, Response}, prelude::*};
use super::{SessionId, UserData};


/// Handles POST requests to `/~login`.
pub(crate) async fn handle_login(req: Request<Body>, ctx: &Context) -> Result<Response, Response> {
    let (parts, body) = req.into_parts();

    // TODO: add size limit to avoid reading arbitrarily large bodies.
    // TODO: maybe have better responses for failing to read the body.
    let body = hyper::body::to_bytes(body).await.expect("failed to read POST /~login body");

    // TODO: check if a user is already logged in? And remove that session then?

    let user_from_headers = UserData::from_auth_headers(&parts.headers, &ctx.config.auth);
    match (body.is_empty(), user_from_headers) {
        // Some auth proxy sent the request, did the authorization and put all
        // user information into our auth headers. We need to create a DB
        // session now.
        (true, Some(user)) => {
            debug!("Login request for '{}': POST /~login with auth headers set", user.username);

            let db = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;
            let session_id = user.persist_new_session(&db).await.map_err(|e| {
                error!("DB query failed when adding new user session: {}", e);
                http::response::internal_server_error()
            })?;
            debug!("Persisted new session for '{}'", user.username);

            Response::builder()
                .status(StatusCode::NO_CONTENT)
                .header("set-cookie", session_id.set_cookie().to_string())
                .body(Body::empty())
                .unwrap()
                .pipe(Ok)
        }

        // We got some POST login data and no auth headers. We still need to
        // check the login data via the configured login server.
        (false, None) => {
            todo!()
        }

        // We have POST login data but also auth headers. This should not happen!
        (false, Some(_)) => {
            warn!("Got POST /~login request with login data and auth headers");
            Err(http::response::bad_request())
        }

        // We have neither POST login data nor auth headers. This should also never happen!
        (true, None) => {
            warn!("Got POST /~login request with neither login data nor auth headers");
            Err(http::response::bad_request())
        }
    }
}

/// Handles POST requests to `/~logout`.
///
/// This checks for the session cookie. If it exists, tries to remove that
/// session from the DB. If it does not exist in the DB, this is ignored. DB
/// errors are also ignored. So in any case, the session cookie is then removed
/// by responding with a fitting `set-cookie` header.
///
/// Consider someone on a public computer: they want to delete the local session
/// cookie when they leave it. That's the important thing, not whether the
/// session is still in the DB. Also, if someone already has your session ID,
/// you have bigger problems. Further, there should be a function to delete all
/// active sessions for a user that the user can find somewhere in the
/// settings. That's the proper tool to remove sessions. Still:
///
/// TODO: maybe notify the user about these failures?
pub(crate) async fn handle_logout(req: Request<Body>, ctx: &Context) -> Response {
    let response = Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("set-cookie", SessionId::unset_cookie().to_string())
        .body(Body::empty())
        .unwrap();


    let session_id = match SessionId::from_headers(req.headers()) {
        None => {
            warn!("POST request to /~logout without session cookie");
            return response;
        }
        Some(id) => id,
    };

    let db = match db::get_conn_or_service_unavailable(&ctx.db_pool).await {
        Err(_) => return response,
        Ok(db) => db,
    };

    match session_id.remove_from_db(&db).await {
        Ok(Some(username)) => debug!("Removed session for '{}' from DB", username),
        Ok(None) => warn!("Session not found in DB during logout"),
        Err(e) => {
            error!("DB error when removing session from DB: {}", e);
            return response;
        }
    }

    response
}
