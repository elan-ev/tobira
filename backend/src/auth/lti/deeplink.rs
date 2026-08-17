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
use hyper::{Request, StatusCode, Uri, body::Incoming, header};
use secrecy::ExposeSecret;
use serde::Deserialize;

use crate::{
    api::Id,
    auth::{
        HasRoles, SessionId, User, base64encode,
        cache::{DeepLinkSelection, DeepLinkState},
        config::LtiPlatform,
    },
    db,
    http::{self, Context, Response},
    prelude::*,
    util::{ByteBody, HttpUrl, download_body},
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

/// Handles `POST /~lti/deep-link-confirm`: the selection page confirms the
/// teacher's pick (form fields `s` = token, `id` = Tobira ID). The selection
/// is resolved in the DB and its authorization **re-checked server-side** —
/// the client's pick is a proposal, not an authorization.
pub(crate) async fn handle_confirm(req: Request<Incoming>, ctx: &Context) -> Response {
    if !ctx.config.auth.lti.enabled {
        return http::response::not_found();
    }

    let (parts, body) = req.into_parts();
    let body = match download_body(body).await {
        Ok(body) => body,
        Err(e) => {
            error!("LTI deep linking: failed to read confirm body: {e}");
            return http::response::bad_request("could not read request body");
        }
    };
    let params: BTreeMap<Cow<str>, Cow<str>> = form_urlencoded::parse(&body).collect();
    let get = |key: &str| params.get(key).map(|s| s.trim()).filter(|s| !s.is_empty());
    let (Some(token), Some(id)) = (get("s"), get("id")) else {
        return http::response::bad_request("LTI deep linking: missing 's' or 'id'");
    };

    // The confirm must come from the very session the launch created. The
    // token↔session binding is checked by the store below; here we need the
    // session's user for the authorization check.
    let Some(session_id) = SessionId::from_headers(&parts.headers) else {
        return http::response::bad_request("LTI deep linking: no session");
    };
    let db = match db::get_conn_or_service_unavailable(&ctx.db_pool).await {
        Ok(db) => db,
        Err(response) => return response,
    };
    let user = match User::new(&parts.headers, &db, ctx).await {
        Ok(Some(user)) => user,
        Ok(None) => return http::response::bad_request("LTI deep linking: not logged in"),
        Err(response) => return response,
    };

    let Some(selection) = resolve_selection(id, &user, &db, ctx).await else {
        warn!("LTI deep linking: user '{}' confirmed an unknown or unauthorized item",
            user.username);
        return http::response::bad_request("LTI deep linking: unknown or unauthorized item");
    };

    let session_value = base64encode(session_id.0.expose_secret());
    if !ctx.auth_caches.lti_deep_link.confirm(token, &session_value, selection).await {
        warn!("LTI deep linking: confirm with unknown/expired token or wrong session");
        return http::response::bad_request(
            "LTI deep linking: selection expired — please reopen it from your course",
        );
    }

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(ByteBody::empty())
        .unwrap()
}

/// Resolves a picked Tobira ID to the data the content item needs, enforcing
/// read authorization. Returns `None` for unknown items, foreign ID kinds, and
/// items the user may not read.
async fn resolve_selection(
    id: &str,
    user: &User,
    db: &db::Db,
    ctx: &Context,
) -> Option<DeepLinkSelection> {
    let id = id.parse::<Id>().ok()?;
    let base = ctx.config.general.tobira_url.to_string();
    let auth_config = &ctx.config.auth;

    if let Some(key) = id.key_for(Id::EVENT_KIND) {
        let row = db.query_opt(
            "select title, opencast_id, read_roles, write_roles from events where id = $1",
            &[&key],
        ).await.ok()??;
        let read: Vec<String> = row.get(2);
        let write: Vec<String> = row.get(3);
        if !user.overlaps_roles(read.iter().chain(&write), auth_config) {
            return None;
        }
        Some(DeepLinkSelection {
            title: row.get(0),
            url: format!("{base}/!v/:{}", row.get::<_, String>(1)),
        })
    } else if let Some(key) = id.key_for(Id::SERIES_KIND) {
        // Tobira does not enforce series read ACLs — any logged-in user can
        // open a series page — so, mirroring `searchAllSeries`, being logged
        // in is the bar here.
        let row = db.query_opt(
            "select title, opencast_id from series where id = $1",
            &[&key],
        ).await.ok()??;
        Some(DeepLinkSelection {
            title: row.get::<_, Option<String>>(0)?,
            url: format!("{base}/!s/:{}", row.get::<_, String>(1)),
        })
    } else if let Some(key) = id.key_for(Id::PLAYLIST_KIND) {
        let row = db.query_opt(
            "select title, opencast_id, read_roles, write_roles from playlists where id = $1",
            &[&key],
        ).await.ok()??;
        let read: Vec<String> = row.get(2);
        let write: Vec<String> = row.get(3);
        if !user.overlaps_roles(read.iter().chain(&write), auth_config) {
            return None;
        }
        Some(DeepLinkSelection {
            title: row.get(0),
            url: format!("{base}/!p/:{}", row.get::<_, String>(1)),
        })
    } else {
        None
    }
}

/// Handles `GET /~lti/deep-link-return`: consumes the token (one-time) and
/// responds with a page that auto-POSTs the signed `LtiDeepLinkingResponse`
/// to the platform's return URL. With `cancel=1`, the response carries no
/// content items, cleanly ending the selection on the platform side.
///
/// No session is required here: the selection was already resolved and
/// session-verified at confirm time, and this endpoint runs inside the LMS's
/// iframe, where our session cookie does not exist.
pub(crate) async fn handle_return(req: Request<Incoming>, ctx: &Context) -> Response {
    if !ctx.config.auth.lti.enabled {
        return http::response::not_found();
    }

    let query = req.uri().query().unwrap_or("");
    let params: BTreeMap<Cow<str>, Cow<str>>
        = form_urlencoded::parse(query.as_bytes()).collect();
    let Some(token) = params.get("s").filter(|s| !s.is_empty()) else {
        return http::response::bad_request("LTI deep linking: missing token");
    };
    let cancel = params.get("cancel").is_some_and(|v| v == "1");

    let Some(state) = ctx.auth_caches.lti_deep_link.take(token).await else {
        warn!("LTI deep linking: return with unknown, expired or already-used token");
        return http::response::bad_request(
            "LTI deep linking: selection expired — please reopen it from your course",
        );
    };

    let (content_items, msg) = match (cancel, &state.selection) {
        (true, _) => (serde_json::json!([]), Some("Selection cancelled")),
        (false, Some(selection)) => {
            let item = serde_json::json!({
                "type": "ltiResourceLink",
                "title": selection.title,
                "url": selection.url,
                "window": { "targetName": "_blank" },
            });
            (serde_json::json!([item]), None)
        }
        (false, None) => {
            warn!("LTI deep linking: return without a confirmed selection");
            return http::response::bad_request("LTI deep linking: nothing was selected");
        }
    };

    let now = chrono::Utc::now().timestamp();
    let mut payload = serde_json::json!({
        // For tool → platform messages, the roles are reversed: we are the
        // issuer, the platform is the audience.
        "iss": state.client_id,
        "aud": state.issuer,
        "iat": now,
        "exp": now + 300,
        "nonce": random_token(),
        "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse",
        "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
        "https://purl.imsglobal.org/spec/lti/claim/deployment_id": state.deployment_id,
        "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": content_items,
    });
    if let Some(data) = &state.data {
        // Must be echoed verbatim; never interpreted.
        payload["https://purl.imsglobal.org/spec/lti-dl/claim/data"]
            = serde_json::json!(data);
    }
    if let Some(msg) = msg {
        payload["https://purl.imsglobal.org/spec/lti-dl/claim/msg"] = serde_json::json!(msg);
    }

    let jwt = ctx.lti_tool_key.sign_jwt(&payload);
    auto_submit_page(&state.return_url, &jwt)
}

/// Builds the page that immediately POSTs the signed response to the
/// platform. Served with its own strict CSP: scripts only via nonce, and
/// `form-action` restricted to exactly the platform's return URL origin (the
/// SPA's global policy has `form-action 'none'` and stays untouched).
fn auto_submit_page(return_url: &str, jwt: &str) -> Response {
    // The URL was validated as https at launch time; origin extraction cannot
    // really fail, but degrade to a non-submitting page rather than panic.
    let form_action = return_url.parse::<Uri>().ok()
        .and_then(|uri| {
            let scheme = uri.scheme_str()?;
            let authority = uri.authority()?;
            Some(format!("{scheme}://{authority}"))
        });
    let Some(form_action) = form_action else {
        error!("LTI deep linking: stored return URL is unusable");
        return http::response::internal_server_error();
    };

    let nonce = random_token();
    let html = format!(
        "<!DOCTYPE html>\
        <html lang=\"en\">\
        <head><meta charset=\"utf-8\"><title>Returning to your course…</title></head>\
        <body>\
            <form method=\"post\" action=\"{action}\">\
                <input type=\"hidden\" name=\"JWT\" value=\"{jwt}\">\
                <noscript><button type=\"submit\">Continue to your course</button></noscript>\
            </form>\
            <script nonce=\"{nonce}\">document.forms[0].submit();</script>\
        </body>\
        </html>",
        action = html_escape(return_url),
        jwt = html_escape(jwt),
    );

    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=UTF-8")
        .header("Content-Security-Policy", format!(
            "default-src 'none'; script-src 'nonce-{nonce}'; \
                form-action {form_action}; base-uri 'none'",
        ))
        .body(html.into())
        .unwrap()
}

/// Minimal HTML escaping for text interpolated into the auto-submit page.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_escape_neutralizes_metacharacters() {
        assert_eq!(
            html_escape(r#"<a href="x">&'"#),
            "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
        );
    }

    #[test]
    fn auto_submit_page_restricts_form_action_to_the_return_origin() {
        let response = auto_submit_page("https://lms.example.org/lti/return?course=7", "a.b.c");
        let csp = response.headers()
            .get("Content-Security-Policy").unwrap()
            .to_str().unwrap();
        assert!(csp.contains("default-src 'none'"));
        assert!(csp.contains("form-action https://lms.example.org;"));
        assert!(csp.contains("script-src 'nonce-"));
    }
}
