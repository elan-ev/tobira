use std::unreachable;

use base64::Engine;
use hyper::{Body, StatusCode};
use serde::Deserialize;

use crate::{
    auth::config::LoginCredentialsHandler,
    config::OpencastConfig,
    db,
    http::{self, response::bad_request, Context, Request, Response},
    prelude::*,
    util::download_body,
};
use super::{config::SessionEndpointHandler, AuthSource, SessionId, User};


/// Handles POST requests to `/~session`.
pub(crate) async fn handle_post_session(
    req: Request<Body>,
    ctx: &Context,
) -> Result<Response, Response> {
    let user = match &ctx.config.auth.session.from_session_endpoint {
        SessionEndpointHandler::None => {
            warn!("Got POST /~session request, but this route is disabled via \
                'auth.session.from_session_endpoint'");
            return Ok(http::response::not_found());
        }
        SessionEndpointHandler::TrustAuthHeaders => {
            User::from_auth_headers(&req.headers(), &ctx.config.auth)
        }
        SessionEndpointHandler::Callback(callback_url) => {
            User::from_auth_callback(
                &req.headers(),
                &callback_url,
                &ctx.config.auth,
                &ctx.auth_caches,
            ).await?
        }
    };

    trace!("POST /~session with handler {:?} resulted in user: {:?}",
        ctx.config.auth.session.from_session_endpoint,
        user,
    );

    match user {
        // User is authenticated -> create session for it and set `Set-Cookie` header.
        Some(user) => create_session(user, ctx).await,

        // No authentication -> we can't create a session. This should normally
        // not happen as the auth integration should only send a request here
        // when the request can be authenticated. But users can always manually
        // call this for example.
        None => Err(http::response::unauthorized()),
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
    if ctx.config.auth.source != AuthSource::TobiraSession {
        warn!("Got DELETE /~session request, but due to 'auth.source', this endpoint is disabled");
        return http::response::not_found();
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
    if ctx.config.auth.session.from_login_credentials == LoginCredentialsHandler::None {
        warn!("Got POST /~login request, but due to 'auth.mode', this endpoint is disabled.");
        return http::response::not_found();
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
    let body = match download_body(req.into_body()).await {
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
    let user = match &ctx.config.auth.session.from_login_credentials {
        LoginCredentialsHandler::Opencast => {
            match check_opencast_login(&userid, &password, &ctx.config.opencast).await {
                Err(e) => {
                    error!("Error occured while checking Opencast login data: {e:#}");
                    return http::response::internal_server_error();
                }
                Ok(user) => user,
            }
        }
        LoginCredentialsHandler::Callback(callback_url) => {
            let body = serde_json::json!({
                "userid": userid,
                "password": password,
            });
            let mut req = Request::new(body.to_string().into());
            *req.method_mut() = hyper::Method::POST;
            *req.uri_mut() = callback_url.clone();

            match User::from_callback_impl(req, &ctx.config.auth).await {
                Err(e) => return e,
                Ok(user) => user,
            }
        }
        _ => unreachable!(),
    };

    match user {
        None => Response::builder().status(StatusCode::FORBIDDEN).body(Body::empty()).unwrap(),
        Some(user) => create_session(user, ctx).await.unwrap_or_else(|e| e),
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
        #[serde(rename = "userRole")]
        user_role: String,
    }

    #[derive(Deserialize)]
    struct InfoMeUserResponse {
        name: String,
        username: String,
        email: Option<String>,
    }

    let body = download_body(response.into_body()).await?;
    let mut info: InfoMeResponse = serde_json::from_slice(&body)
        .context("Could not deserialize `/info/me.json` response")?;

    // If all roles are `ROLE_ANONYMOUS`, then we assume the login was invalid.
    if info.roles.iter().all(|role| role == super::ROLE_ANONYMOUS) {
        return Ok(None);
    }

    // Make sure the roles list always contains the user role. This is very
    // likely always the case, but better be sure.
    if !info.roles.contains(&info.user_role) {
        info.roles.push(info.user_role.clone());
    }

    // Otherwise the login was correct!
    Ok(Some(User {
        username: info.user.username,
        display_name: info.user.name,
        email: info.user.email,
        roles: info.roles.into_iter().collect(),
        user_role: info.user_role,
    }))
}

/// Creates a session for the given user and persists it in the DB.
async fn create_session(mut user: User, ctx: &Context) -> Result<Response, Response> {
    user.add_default_roles();

    // TODO: check if a user is already logged in? And remove that session then?

    let db = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;
    let session_id = user.persist_new_session(&db).await.map_err(|e| {
        error!("DB query failed when adding new user session: {}", e);
        http::response::internal_server_error()
    })?;
    debug!("Persisted new session for '{}'", user.username);

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("set-cookie", session_id.set_cookie(ctx.config.auth.session.duration).to_string())
        .body(Body::empty())
        .unwrap()
        .pipe(Ok)
}
