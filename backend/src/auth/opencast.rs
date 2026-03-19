use base64::Engine;
use hyper::{StatusCode, Request};
use serde::Deserialize;

use crate::{
    http::Context,
    prelude::*,
    util::{download_body, ByteBody},
};
use super::User;



/// Requests `/info/me.json` with the given credentials via HTTP Basic auth.
///
///
pub(super) async fn try_login(
    userid: &str,
    password: &str,
    ctx: &Context,
) -> Result<Option<User>> {
    trace!("Checking Opencast login...");

    // Send request. We use basic auth here: our configuration checks already
    // assert that we use HTTPS or Opencast is running on the same machine
    // (or the admin has explicitly opted out of this check).
    let credentials = base64::engine::general_purpose::STANDARD
        .encode(&format!("{userid}:{password}"));
    let auth_header = format!("Basic {}", credentials);
    let req = Request::builder()
        .uri(ctx.config.opencast.sync_node().clone().with_path_and_query("/info/me.json"))
        .header(hyper::header::AUTHORIZATION, auth_header)
        .body(ByteBody::empty())
        .unwrap();
    let response = ctx.http_client.request(req).await?;


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
        user_realm_handle: None,
    }))
}
