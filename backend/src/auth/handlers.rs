use base64::Engine;
use hyper::{Body, StatusCode};
use serde::Deserialize;

use crate::{
    db,
    http::{self, Context, Request, Response, response::{bad_request, internal_server_error}},
    prelude::*,
    config::OpencastConfig, auth::ROLE_ANONYMOUS,
};
use super::{AuthMode, SessionId, User};


/// Handles POST requests to `/~session`.
pub(crate) async fn handle_post_session(req: Request<Body>, ctx: &Context) -> Result<Response, Response> {
    if ctx.config.auth.mode != AuthMode::LoginProxy {
        warn!("Got POST /~session request, but due to the authentication mode, this endpoint \
            is disabled");

        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::empty())
            .unwrap()
            .pipe(Ok);
    }

    match User::from_auth_headers(&req.headers(), &ctx.config.auth) {
        Some(user) => {
            // Some auth proxy received the request, did the authorization, put all
            // user information into our auth headers and forwarded it to us. We
            // need to create a DB session now and reply with a `set-cookie` header.
            debug!("Login request for '{}' (POST '/~session' with auth headers)", user.username);

            create_session(user, ctx).await
        }

        None => {
            // No auth headers are set: this should not happen. This means that
            // either there is no auth proxy or it was incorrectly configured.
            warn!("Got POST /~session request without auth headers set: this should not happen");
            Err(http::response::bad_request(None))
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
pub(crate) async fn handle_delete_session(req: Request<Body>, ctx: &Context) -> Response {
    if !matches!(ctx.config.auth.mode, AuthMode::LoginProxy | AuthMode::Opencast) {
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

const USERID_FIELD: &str = "userid";
const PASSWORD_FIELD: &str = "password";

/// Handles `POST /~login` request.
pub(crate) async fn handle_post_login(req: Request<Body>, ctx: &Context) -> Response {
    if ctx.config.auth.mode != AuthMode::Opencast {
        warn!("Got POST /~login request, but 'auth.mode' is not 'opencast', \
            so login requests have to be handled by your reverse proxy. \
            Please see the documentation about auth.");
        return Response::builder().status(StatusCode::NOT_FOUND).body(Body::empty()).unwrap();
    }

    trace!("Handling POST /~login...");

    // Make sure the request has the right content type.
    let correct_content_type = req.headers()
        .get(hyper::header::CONTENT_TYPE)
        .map_or(false, |v| v.as_bytes().starts_with(b"application/x-www-form-urlencoded"));
    if !correct_content_type {
        return bad_request("incorrect content type");
    }

    // Download whole body.
    let body = match hyper::body::to_bytes(req.into_body()).await {
        Ok(v) => v,
        Err(e) => {
            error!("Failed to download login request body: {e}");
            return bad_request(None);
        },
    };

    // Extract form data.
    let mut userid = None;
    let mut password = None;
    for (key, value) in form_urlencoded::parse(&body) {
        match key.as_ref() {
            USERID_FIELD if userid.is_some() => return bad_request("duplicate field userid"),
            USERID_FIELD => userid = Some(value),
            PASSWORD_FIELD if password.is_some() => return bad_request("duplicate field password"),
            PASSWORD_FIELD => password = Some(value),
            _ => return bad_request("unknown field"),
        }
    }

    let Some(userid) = userid else {
        return bad_request("missing field userid");
    };
    let Some(password) = password else {
        return bad_request("missing field password");
    };


    // Check the login data.
    match check_opencast_login(&userid, &password, &ctx.config.opencast).await {
        Err(e) => {
            error!("Error occured while checking Opencast login data: {e}");
            internal_server_error()
        }
        Ok(None) => Response::builder().status(StatusCode::FORBIDDEN).body(Body::empty()).unwrap(),
        Ok(Some(user)) => create_session(user, ctx).await.unwrap_or_else(|e| e),
    }
}

async fn check_opencast_login(
    userid: &str,
    password: &str,
    config: &OpencastConfig,
) -> Result<Option<User>> {
    trace!("Checking Opencast login...");
    let client = crate::util::http_client();

    // Send request. We use basic auth here: our configuration checks already
    // assert that we use HTTPS or Opencast is running on the same machine
    // (or the admin has explicitly opted out of this check).
    let credentials = base64::engine::general_purpose::STANDARD
        .encode(&format!("{userid}:{password}"));
    let auth_header = format!("Basic {}", credentials);
    let req = Request::builder()
        .uri(config.sync_node().clone().with_path_and_query("/info/me.json"))
        .header(hyper::header::AUTHORIZATION, auth_header)
        .body(Body::empty())
        .unwrap();
    let response = client.request(req).await?;


    // We treat all non-OK response as invalid login data.
    if response.status() != StatusCode::OK {
        return Ok(None);
    }


    // Deserialize JSON body.
    #[derive(Deserialize)]
    struct InfoMeResponse {
        roles: Vec<String>,
        user: InfoMeUserResponse,
    }

    #[derive(Deserialize)]
    struct InfoMeUserResponse {
        name: String,
        username: String,
        email: Option<String>,
    }

    let body = hyper::body::to_bytes(response.into_body()).await?;
    let info: InfoMeResponse = serde_json::from_slice(&body)
        .context("Could not deserialize `/info/me.json` response")?;

    // If all roles are `ROLE_ANONYMOUS`, then we assume the login was invalid.
    if info.roles.iter().all(|role| role == super::ROLE_ANONYMOUS) {
        return Ok(None);
    }

    // Otherwise the login was correct!
    Ok(Some(User {
        username: info.user.username,
        display_name: info.user.name,
        email: info.user.email,
        // Sometimes, Opencast does not include `ROLE_ANONYMOUS` in the
        // response, so we just add it here to be sure.
        roles: info.roles.into_iter().chain([ROLE_ANONYMOUS.to_owned()]).collect(),
    }))
}

/// Creates a session for the given user and persists it in the DB.
async fn create_session(user: User, ctx: &Context) -> Result<Response, Response> {
    // TODO: check if a user is already logged in? And remove that session then?

    let db = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;
    let session_id = user.persist_new_session(&db).await.map_err(|e| {
        error!("DB query failed when adding new user session: {}", e);
        http::response::internal_server_error()
    })?;
    debug!("Persisted new session for '{}'", user.username);

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("set-cookie", session_id.set_cookie(ctx.config.auth.session_duration).to_string())
        .body(Body::empty())
        .unwrap()
        .pipe(Ok)
}
