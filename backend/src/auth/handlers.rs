use hyper::{Body, StatusCode};

use crate::{db, http::{self, Context, Request, Response}, prelude::*};
use super::{AuthMode, SessionId, UserData};


/// Handles POST requests to `/~session`.
pub(crate) async fn handle_login(req: Request<Body>, ctx: &Context) -> Result<Response, Response> {
    if ctx.config.auth.mode != AuthMode::LoginProxy {
        warn!("Got POST /~session request, but due to the authentication mode, this endpoint \
            is disabled");

        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::empty())
            .unwrap()
            .pipe(Ok);
    }

    match UserData::from_auth_headers(&req.headers(), &ctx.config.auth) {
        Some(user) => {
            // Some auth proxy received the request, did the authorization, put all
            // user information into our auth headers and forwarded it to us. We
            // need to create a DB session now and reply with a `set-cookie` header.
            debug!("Login request for '{}' (POST '/~session' with auth headers)", user.username);

            // TODO: check if a user is already logged in? And remove that session then?

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

        None => {
            // No auth headers are set: this should not happen. This means that
            // either there is no auth proxy or it was incorrectly configured.
            warn!("Got POST /~session request without auth headers set: this should not happen");
            Err(http::response::bad_request())
        }
    }
}

/// Handles DELETE requests to `/~session`.
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
    if ctx.config.auth.mode != AuthMode::LoginProxy {
        warn!("Got DELETE /~session request, but due to the authentication mode, this endpoint \
            is disabled");

        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::empty())
            .unwrap();
    }

    let response = Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("set-cookie", SessionId::unset_cookie().to_string())
        .body(Body::empty())
        .unwrap();


    let session_id = match SessionId::from_headers(req.headers()) {
        None => {
            warn!("DELETE request to /~session without session cookie");
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
        Err(e) => error!("DB error when removing session from DB: {}", e),
    }

    response
}
