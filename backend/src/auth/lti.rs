//! LTI 1.3 launch flow. Tobira acts as an LTI *tool* that LMS *platforms*
//! (Moodle, Canvas, …) launch. This runs alongside the normal login and reuses
//! the session machinery — see `docs/docs/dev/rfc-lti-1.3.md`.
//!
//! This module currently implements the OIDC third-party-initiated login
//! (`/~lti/login`). Verifying the actual launch (`/~lti/launch`) and creating a
//! session follows in a separate change.

use std::{borrow::Cow, collections::BTreeMap};

use base64::{Engine, prelude::BASE64_URL_SAFE_NO_PAD};
use hyper::{Method, Request, StatusCode, body::Incoming, header};
use secrecy::ExposeSecret;

use crate::{
    http::{self, Context, Response},
    prelude::*,
    util::{ByteBody, download_body, gen_random_bytes_crypto},
};


/// Handles `/~lti/login`: the OIDC third-party-initiated login that begins an
/// LTI 1.3 launch.
///
/// The platform sends `iss`, `login_hint` and `target_link_uri` (and usually
/// `client_id` / `lti_message_hint`), either as a GET query or a POST form. We
/// resolve the platform, issue a `state` + `nonce` (remembering them so the
/// launch can verify them), and redirect the browser to the platform's
/// authorization endpoint. The platform then POSTs the signed launch
/// (`id_token`) back to `/~lti/launch` (handled in a follow-up).
pub(crate) async fn handle_login(req: Request<Incoming>, ctx: &Context) -> Response {
    let raw = match read_raw_params(req).await {
        Ok(raw) => raw,
        Err(response) => return response,
    };
    let params: BTreeMap<Cow<str>, Cow<str>> = form_urlencoded::parse(&raw).collect();
    let get = |key: &str| params.get(key).map(|s| s.trim()).filter(|s| !s.is_empty());

    let (Some(iss), Some(login_hint), Some(target_link_uri))
        = (get("iss"), get("login_hint"), get("target_link_uri"))
    else {
        return http::response::bad_request(
            "LTI login: missing 'iss', 'login_hint' or 'target_link_uri'",
        );
    };

    // Resolve the platform. `client_id` is optional in the initiation request:
    // match on (iss, client_id) if it is present, otherwise on the issuer alone.
    let lti = &ctx.config.auth.lti;
    let platform = match get("client_id") {
        Some(client_id) => lti.find_platform(iss, client_id),
        None => lti.find_platform_by_issuer(iss),
    };
    let Some(platform) = platform else {
        warn!("LTI login for unknown platform (iss = '{iss}')");
        return http::response::bad_request("LTI login: unknown platform");
    };

    // Issue `state` + `nonce` and remember them for the launch to verify.
    let state = random_token();
    let nonce = random_token();
    ctx.auth_caches.lti_login
        .insert(state.clone(), nonce.clone(), target_link_uri.to_owned())
        .await;

    // Redirect to the platform's authorization endpoint. An LTI launch uses the
    // implicit `id_token` flow with `form_post` response mode.
    let redirect_uri = ctx.config.general.tobira_url.clone()
        .with_path_and_query("/~lti/launch")
        .to_string();
    let mut auth_url = platform.auth_login_url.clone();
    {
        let mut query = auth_url.query_pairs_mut();
        query.extend_pairs([
            ("scope", "openid"),
            ("response_type", "id_token"),
            ("response_mode", "form_post"),
            ("prompt", "none"),
            ("client_id", platform.client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("login_hint", login_hint),
            ("state", state.as_str()),
            ("nonce", nonce.as_str()),
        ]);
        if let Some(hint) = get("lti_message_hint") {
            query.append_pair("lti_message_hint", hint);
        }
    }

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, auth_url.to_string())
        .body(ByteBody::empty())
        .unwrap()
}

/// Reads request parameters from the query string (GET) or the form-encoded
/// body (POST) — LTI initiation may use either.
async fn read_raw_params(req: Request<Incoming>) -> Result<Vec<u8>, Response> {
    if *req.method() == Method::POST {
        download_body(req.into_body()).await
            .map(|body| body.to_vec())
            .map_err(|e| {
                error!("LTI login: failed to read request body: {e}");
                http::response::bad_request("could not read request body")
            })
    } else {
        Ok(req.uri().query().unwrap_or_default().as_bytes().to_vec())
    }
}

/// A URL-safe, unguessable random token (128 bits), used for `state`/`nonce`.
fn random_token() -> String {
    BASE64_URL_SAFE_NO_PAD.encode(gen_random_bytes_crypto::<16>().expose_secret())
}
