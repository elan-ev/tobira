//! LTI Deep Linking 2.0: a teacher launched from the LMS picks a Tobira
//! video/series/playlist, and Tobira sends a signed response describing the
//! pick back to the LMS.
//!
//! The launch usually happens inside the LMS's iframe modal, where the browser
//! drops our `SameSite=Lax` session cookie. The flow therefore spans the
//! iframe and a popup, joined by a `postMessage` handshake — see the design
//! doc (`docs/docs/dev/lti-deep-linking-spec.md`) for the full picture:
//!
//! 1. DL launch (iframe) → state stored under a one-time token → redirect to
//!    the selection page.
//! 2. The selection page, iframed, offers "select in a new window"; the popup
//!    re-acquires the session cookie via the one-time *handoff* endpoint.
//! 3. The popup confirms a selection (server re-checks authorization), then
//!    tells the iframe page, which redeems the token at the *return* endpoint,
//!    auto-POSTing the signed response to the platform — inside the iframe,
//!    where the LMS expects it.

use std::borrow::Cow;
use std::collections::BTreeMap;

use cookie::Cookie;
use hyper::{Request, StatusCode, body::Incoming, header};
use serde::Deserialize;

use crate::{
    auth::{cache::DeepLinkState, config::LtiPlatform},
    http::{self, Context, Response},
    prelude::*,
    util::{ByteBody, HttpUrl},
};

use super::random_token;


/// The subset of the `deep_linking_settings` claim we use. Sent by the
/// platform inside the (signature-verified) launch token.
#[derive(Debug, Deserialize)]
pub(super) struct DeepLinkingSettingsClaim {
    /// Where the signed response must be POSTed.
    deep_link_return_url: String,

    /// Content item types the platform accepts.
    accept_types: Vec<String>,

    /// Opaque platform value; must be echoed verbatim in the response.
    data: Option<String>,
}

/// Checks the settings of a Deep Linking launch. Returns the error response
/// to send if they are missing or unusable.
pub(super) fn validated_settings(
    claims: &super::LtiClaims,
) -> Result<&DeepLinkingSettingsClaim, Response> {
    let Some(settings) = &claims.deep_linking_settings else {
        warn!("LTI deep linking launch without deep_linking_settings claim");
        return Err(http::response::bad_request("LTI deep linking: settings missing"));
    };
    // The return URL receives a form POST from the user's browser — https only.
    let url_ok = settings.deep_link_return_url.parse::<HttpUrl>()
        .is_ok_and(|url| url.ensure_secure_no_fragment().is_ok());
    if !url_ok {
        warn!("LTI deep linking: unusable deep_link_return_url");
        return Err(http::response::bad_request("LTI deep linking: bad return URL"));
    }
    if !settings.accept_types.iter().any(|ty| ty == "ltiResourceLink") {
        warn!("LTI deep linking: platform does not accept ltiResourceLink items");
        return Err(http::response::bad_request(
            "LTI deep linking: platform accepts no LTI resource links",
        ));
    }
    Ok(settings)
}

/// Continues a verified Deep Linking launch into the selection flow: stores
/// the state under a one-time token and redirects to the selection page.
pub(super) async fn start_selection(
    settings: &DeepLinkingSettingsClaim,
    platform: &LtiPlatform,
    session_cookie: &Cookie<'static>,
    ctx: &Context,
) -> Response {
    let token = random_token();
    let state = DeepLinkState::new(
        settings.deep_link_return_url.clone(),
        settings.data.clone(),
        platform.issuer.clone(),
        platform.client_id.clone(),
        platform.deployment_id.clone(),
        session_cookie.value().to_owned(),
        session_cookie.to_string(),
    );
    ctx.auth_caches.lti_deep_link.insert(token.clone(), state).await;

    // The cookie is also set here; in an iframe the browser drops it (that is
    // what the handoff is for), but platforms opening a real window get to
    // skip the popup entirely.
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, format!("/~lti/select?s={token}"))
        .header(header::SET_COOKIE, session_cookie.to_string())
        .body(ByteBody::empty())
        .unwrap()
}

/// Handles `GET /~lti/select-window`: the one-time handoff that lets the
/// selection popup re-acquire the session cookie the iframed launch could not
/// store. Only re-issues the very session the launch itself created, at most
/// once per Deep Linking flow.
pub(crate) async fn handle_select_window(req: Request<Incoming>, ctx: &Context) -> Response {
    if !ctx.config.auth.lti.enabled {
        return http::response::not_found();
    }

    let query = req.uri().query().unwrap_or("");
    let params: BTreeMap<Cow<str>, Cow<str>>
        = form_urlencoded::parse(query.as_bytes()).collect();
    let Some(token) = params.get("s").filter(|s| !s.is_empty()) else {
        return http::response::bad_request("LTI deep linking: missing token");
    };

    let Some(set_cookie) = ctx.auth_caches.lti_deep_link.redeem_handoff(token).await else {
        warn!("LTI deep linking: window handoff with unknown, expired or used token");
        return http::response::bad_request(
            "LTI deep linking: selection expired — please reopen it from your course",
        );
    };

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, format!("/~lti/select?s={token}"))
        .header(header::SET_COOKIE, set_cookie)
        .body(ByteBody::empty())
        .unwrap()
}
