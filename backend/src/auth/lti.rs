//! LTI 1.3 launch flow. Tobira acts as an LTI *tool* that LMS *platforms*
//! (Moodle, Canvas, …) launch. This runs alongside the normal login and reuses
//! the session machinery — see `docs/docs/dev/rfc-lti-1.3.md`.
//!
//! This module implements the OIDC third-party-initiated login (`/~lti/login`)
//! and the launch (`/~lti/launch`): verifying the signed launch token against
//! the platform's JWKS and creating a Tobira session.

use std::{borrow::Cow, collections::BTreeMap};

use aws_lc_rs::{digest, rsa::{KeyPair, KeySize}, signature::KeyPair as _};
use base64::{Engine, prelude::BASE64_URL_SAFE_NO_PAD};
use hyper::{Method, Request, StatusCode, Uri, body::Incoming, header};
use once_cell::sync::Lazy;
use secrecy::ExposeSecret;
use serde::Deserialize;

use crate::{
    auth::{User, config::LtiPlatform},
    http::{self, Context, Response},
    prelude::*,
    sync::client::AuthMode,
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
        .insert(
            state.clone(),
            nonce.clone(),
            target_link_uri.to_owned(),
            platform.issuer.clone(),
            platform.client_id.clone(),
        )
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


/// Handles `POST /~lti/launch`: the actual LTI 1.3 launch.
///
/// The platform `form_post`s the signed `id_token` (and the `state` we issued
/// during login). We consume the matching login state (one-time use), verify
/// the token against the platform's JWKS, check `nonce` + `deployment_id`,
/// build a Tobira user and create a session, then redirect to the
/// `target_link_uri`.
pub(crate) async fn handle_launch(req: Request<Incoming>, ctx: &Context) -> Response {
    // ----- Read the form_post body: `id_token` + `state` ------------------------------------
    let body = match download_body(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            error!("LTI launch: failed to read request body: {e}");
            return http::response::bad_request("could not read request body");
        }
    };
    let params: BTreeMap<Cow<str>, Cow<str>> = form_urlencoded::parse(&body).collect();
    let get = |key: &str| params.get(key).map(|s| s.trim()).filter(|s| !s.is_empty());

    let (Some(id_token), Some(state)) = (get("id_token"), get("state")) else {
        return http::response::bad_request("LTI launch: missing 'id_token' or 'state'");
    };

    // ----- Consume the login state (one-time use → replay/CSRF protection) ------------------
    let Some(login) = ctx.auth_caches.lti_login.take(state).await else {
        warn!("LTI launch with unknown, expired or already-used 'state'");
        return http::response::bad_request("LTI launch: invalid or expired 'state'");
    };
    let Some(platform) = ctx.config.auth.lti.find_platform(&login.issuer, &login.client_id) else {
        // The platform was reconfigured away between login and launch.
        error!("LTI launch: platform for issued state no longer configured");
        return http::response::internal_server_error();
    };

    // ----- Verify the launch token against the platform's JWKS ------------------------------
    let keys = match fetch_platform_jwks(platform, ctx).await {
        Ok(keys) => keys,
        Err(e) => {
            warn!("LTI launch: could not fetch platform JWKS: {e:?}");
            return http::response::bad_request("LTI launch: could not fetch platform keys");
        }
    };
    let raw = match jwtea::RawJwt::new(id_token.to_owned()) {
        Ok(raw) => raw,
        Err(_) => return http::response::bad_request("LTI launch: malformed 'id_token'"),
    };
    let validator = LtiLaunchValidator {
        basic: jwtea::BasicValidator { allowed_clock_skew: 10 },
        issuer: &platform.issuer,
        client_id: &platform.client_id,
    };
    let claims = match raw
        .decode::<(), LtiClaims, _>(keys.as_slice(), &validator, |_header, payload| payload.extra_fields)
        .await
    {
        Ok(claims) => claims,
        Err(e) => {
            warn!("LTI launch: token verification failed: {e:?}");
            return http::response::bad_request("LTI launch: token verification failed");
        }
    };

    // ----- LTI-specific checks the signature verifier can't do ------------------------------
    // `nonce` binds this launch to our login initiation (replay protection).
    if claims.nonce.as_deref() != Some(login.nonce.as_str()) {
        warn!("LTI launch: nonce mismatch");
        return http::response::bad_request("LTI launch: nonce mismatch");
    }
    if claims.deployment_id != platform.deployment_id {
        warn!("LTI launch: deployment_id mismatch");
        return http::response::bad_request("LTI launch: deployment_id mismatch");
    }

    // ----- Build the user and create a session ----------------------------------------------
    // Roles come from Opencast, exactly like the OIDC login (#1706). The
    // username is derived from the launch (`preferred_username`, else `sub`).
    // NOTE: how the launch identity maps to an Opencast username is an open
    // design question (see docs/docs/dev/rfc-lti-1.3.md, OQ8) — this is the
    // provisional MVP mapping.
    let username = claims.preferred_username.clone().unwrap_or_else(|| claims.sub.clone());
    let oc_user = match super::opencast::user_from_info_me(
        AuthMode::Sudo { as_user: &username },
        ctx,
    ).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            warn!("LTI launch: user '{username}' is not known to Opencast");
            return http::response::bad_request("LTI launch: user unknown to Opencast");
        }
        Err(e) => {
            error!("LTI launch: failed to request Opencast user info: {e:#}");
            return http::response::internal_server_error();
        }
    };
    let user = User {
        display_name: claims.name.clone().unwrap_or_else(|| username.clone()),
        email: claims.email.clone(),
        username,
        user_role: oc_user.user_role,
        roles: oc_user.roles,
        user_realm_handle: None,
    };

    let cookie = match super::create_session_with_cookies(user, ctx).await {
        Ok(cookie) => cookie,
        Err(response) => return response,
    };

    // Redirect to the launch target. Only allow targets within our own Tobira
    // instance to avoid turning the launch into an open redirect.
    let target = safe_target(&login.target_link_uri, ctx);
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, target)
        .header(header::SET_COOKIE, cookie.to_string())
        .body(ByteBody::empty())
        .unwrap()
}

/// Fetches and parses the platform's JWKS into verifying keys. Keys we do not
/// understand are skipped.
async fn fetch_platform_jwks(
    platform: &LtiPlatform,
    ctx: &Context,
) -> Result<Vec<jwtea::VerifyingKey>> {
    let uri = platform.keyset_url.as_str().parse::<Uri>().context("invalid keyset URL")?;
    let response = ctx.http_client.get(uri).await?;
    let body = download_body(response.into_body()).await?;
    let jwks: jwtea::Jwks = serde_json::from_slice(&body)
        .context("could not parse platform JWKS")?;
    Ok(jwks.to_verifying_keys().filter_map(|res| res.ok()).collect())
}

/// Returns `target` if it points within our own Tobira instance, otherwise the
/// Tobira base URL. Prevents the launch from being abused as an open redirect.
fn safe_target(target: &str, ctx: &Context) -> String {
    let base = ctx.config.general.tobira_url.to_string();
    if target.starts_with(&base) {
        target.to_owned()
    } else {
        warn!("LTI launch: target_link_uri '{target}' is outside Tobira; using base URL");
        base
    }
}

/// The subset of LTI 1.3 launch claims we read. Only the fields needed for the
/// MVP (verification + identity) are modelled.
#[derive(Deserialize)]
struct LtiClaims {
    iss: String,
    aud: MaybeArray<String>,
    azp: Option<String>,
    sub: String,
    nonce: Option<String>,

    // User info (standard OIDC claims the platform may include).
    name: Option<String>,
    preferred_username: Option<String>,
    email: Option<String>,

    #[serde(rename = "https://purl.imsglobal.org/spec/lti/claim/deployment_id")]
    deployment_id: String,
}

/// A JSON value that may be a single item or an array of them (e.g. `aud`).
#[derive(Deserialize)]
#[serde(untagged)]
enum MaybeArray<T> {
    Single(T),
    Array(Vec<T>),
}

impl<T> MaybeArray<T> {
    fn as_slice(&self) -> &[T] {
        match self {
            Self::Single(single) => std::slice::from_ref(single),
            Self::Array(items) => items,
        }
    }
}

/// Verifies the LTI launch token's core claims. Runs *after* the signature has
/// been checked, so the claims are trustworthy. Mirrors the OIDC
/// `IdTokenValidator`, enforcing `iss`, `aud` and `azp` against the platform
/// registration (plus `exp`/`nbf` via [`jwtea::BasicValidator`]).
struct LtiLaunchValidator<'a> {
    basic: jwtea::BasicValidator,
    issuer: &'a str,
    client_id: &'a str,
}

impl<H> jwtea::Validator<H, LtiClaims> for LtiLaunchValidator<'_> {
    fn validate(
        &self,
        header: &jwtea::Header<H>,
        payload: &jwtea::Payload<LtiClaims>,
    ) -> Result<(), jwtea::Error> {
        self.basic.validate(header, payload)?;
        let claims = &payload.extra_fields;
        if claims.iss != self.issuer {
            return Err(jwtea::Error::ValidationError("'iss' does not match platform".into()));
        }
        if !claims.aud.as_slice().iter().any(|aud| aud == self.client_id) {
            return Err(jwtea::Error::ValidationError("'aud' does not contain client ID".into()));
        }
        if claims.azp.as_deref().is_some_and(|azp| azp != self.client_id) {
            return Err(jwtea::Error::ValidationError("'azp' does not match client ID".into()));
        }
        Ok(())
    }
}


/// The tool's RSA key pair for LTI, plus its public JWKS document.
///
/// LTI tools sign the Deep Linking response and service `client_assertion`s
/// with RSA (RS256); platforms fetch the tool's public key from `/~lti/jwks`
/// and also require it during tool registration. `jwtea` only *verifies*, so
/// the signing/keyset side uses `aws-lc-rs` directly.
///
/// For now the key is generated once per process. A configurable persistent key
/// (PEM) is a later enhancement — platforms re-fetch the keyset, so a fresh key
/// across restarts is still valid, it just invalidates in-flight signed
/// messages (of which the MVP has none).
struct LtiToolKey {
    /// Kept for signing the Deep Linking response / NRPS `client_assertion`
    /// (added with those features).
    #[allow(dead_code)]
    keypair: KeyPair,

    /// The public JWKS document served at `/~lti/jwks`.
    jwks: String,
}

impl LtiToolKey {
    fn generate() -> Self {
        let keypair = KeyPair::generate(KeySize::Rsa2048)
            .expect("failed to generate LTI tool RSA key");
        let public = keypair.public_key();

        // JWK RSA components: base64url(big-endian modulus / exponent).
        let n = BASE64_URL_SAFE_NO_PAD.encode(public.modulus().big_endian_without_leading_zero());
        let e = BASE64_URL_SAFE_NO_PAD.encode(public.exponent().big_endian_without_leading_zero());
        // A stable key id derived from the public key.
        let kid = BASE64_URL_SAFE_NO_PAD.encode(
            digest::digest(&digest::SHA256, public.as_ref()).as_ref(),
        );

        let jwks = serde_json::json!({
            "keys": [{
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": kid,
                "n": n,
                "e": e,
            }],
        }).to_string();

        Self { keypair, jwks }
    }
}

static LTI_TOOL_KEY: Lazy<LtiToolKey> = Lazy::new(LtiToolKey::generate);

/// Handles `GET /~lti/jwks`: serves the tool's public keys (JWKS) so platforms
/// can register Tobira and verify JWTs it signs (Deep Linking response, service
/// grants). Only served when LTI is enabled.
pub(crate) async fn handle_jwks(ctx: &Context) -> Response {
    if !ctx.config.auth.lti.enabled {
        return http::response::not_found();
    }
    Response::builder()
        .header(header::CONTENT_TYPE, "application/json")
        .body(ByteBody::new(LTI_TOOL_KEY.jwks.clone().into()))
        .unwrap()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_jwks_has_one_rsa_signing_key() {
        let key = LtiToolKey::generate();
        let doc: serde_json::Value = serde_json::from_str(&key.jwks).unwrap();
        let jwk = &doc["keys"][0];

        assert_eq!(jwk["kty"], "RSA");
        assert_eq!(jwk["use"], "sig");
        assert_eq!(jwk["alg"], "RS256");
        // 2048-bit modulus, base64url-encoded, is well over 300 chars.
        assert!(jwk["n"].as_str().unwrap().len() > 300);
        assert!(!jwk["e"].as_str().unwrap().is_empty());
        assert!(!jwk["kid"].as_str().unwrap().is_empty());
    }
}
