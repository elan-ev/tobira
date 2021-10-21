use hyper::{Body, StatusCode};

use crate::{db, http::{self, Context, Request, Response}, prelude::*};
use super::UserData;


/// Handles POSTs to `/~login`.
pub(crate) async fn handle_login(req: Request<Body>, ctx: &Context) -> Result<Response, Response> {
    let (parts, body) = req.into_parts();

    // TODO: add size limit to avoid reading arbitrarily large bodies.
    // TODO: maybe have better responses for failing to read the body.
    let body = hyper::body::to_bytes(body).await.expect("failed to read POST /~login body");

    let user_from_headers = UserData::from_auth_headers(&parts.headers, &ctx.config.auth);
    match (body.is_empty(), user_from_headers) {
        // Some auth proxy sent the request, did the authorization and put all
        // user information into our auth headers. We need to create a DB
        // session now.
        (true, Some(user)) => {
            let db = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;
            let session_id = user.persist_new_session(&db).await.map_err(|e| {
                error!("DB query failed when adding new user session: {}", e);
                http::response::internal_server_error()
            })?;

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
