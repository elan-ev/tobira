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
use secrecy::ExposeSecret;

pub(crate) mod deeplink;
use serde::Deserialize;

use crate::{
    auth::{User, config::{LtiConfig, LtiPlatform, LtiUsernameSource}},
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
    if !ctx.config.auth.lti.enabled {
        return http::response::not_found();
    }
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
    if !ctx.config.auth.lti.enabled {
        return http::response::not_found();
    }

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
        .decode::<(), LtiClaims, _>(
            keys.as_slice(),
            &validator,
            |_header, payload| payload.extra_fields,
        )
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

    debug!("LTI launch claims: {claims:#?}");

    // ----- Dispatch on the message type ------------------------------------------------------
    // Unknown types are rejected before the expensive user resolution; Deep
    // Linking requests additionally need valid settings, checked here so a
    // broken request fails before a session is created.
    let kind = match launch_kind(&claims) {
        Some(kind) => kind,
        None => {
            let ty = claims.message_type.as_deref().unwrap_or("<absent>");
            warn!("LTI launch with unsupported message_type '{ty}'");
            return http::response::bad_request("LTI launch: unsupported message type");
        }
    };
    let deep_linking_settings = match kind {
        LaunchKind::ResourceLink => None,
        LaunchKind::DeepLinking => {
            match deeplink::validated_settings(&claims) {
                Ok(settings) => Some(settings),
                Err(response) => return response,
            }
        }
    };

    // ----- Build the user and create a session ----------------------------------------------
    // Roles come from Opencast, exactly like the OIDC login (#1706). The
    // username comes from the claim the platform is configured to use; see the
    // `username_source` config and RFC OQ8.
    let Some(username) = resolve_username(&claims, platform.username_source) else {
        warn!(
            "LTI launch: no username in launch (username_source = {:?})",
            platform.username_source,
        );
        return http::response::bad_request("LTI launch: no username provided by platform");
    };
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

    // A Deep Linking launch continues into the selection flow instead of
    // landing on content.
    if let Some(settings) = deep_linking_settings {
        return deeplink::start_selection(settings, platform, &cookie, ctx).await;
    }

    // Decide where to land; see `landing_target`. Both candidates are kept
    // within Tobira (no open redirect).
    let custom_series = claims.custom.as_ref()
        .and_then(|custom| custom.get("series"))
        .and_then(|series| series.as_str());
    let target = landing_target(
        &login.target_link_uri,
        custom_series,
        &ctx.config.general.tobira_url.to_string(),
    );
    // `target` is constrained to our own origin, but a `series` custom parameter
    // could still carry characters that are invalid in a header; fall back to the
    // base URL rather than panic when building the response.
    let location = header::HeaderValue::from_str(&target).unwrap_or_else(|_| {
        header::HeaderValue::from_str(&ctx.config.general.tobira_url.to_string())
            .expect("tobira_url is a valid header value")
    });
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location)
        .header(header::SET_COOKIE, cookie.to_string())
        .body(ByteBody::empty())
        .unwrap()
}

/// The kind of LTI message a launch carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LaunchKind {
    /// A regular content launch (`LtiResourceLinkRequest`).
    ResourceLink,
    /// A Deep Linking content selection request (`LtiDeepLinkingRequest`).
    DeepLinking,
}

/// Classifies the launch by its `message_type` claim. An *absent* claim is
/// treated as a resource link: the spec requires the claim, but being lenient
/// here keeps already-working platform configurations working. Unknown types
/// yield `None` and must be rejected.
fn launch_kind(claims: &LtiClaims) -> Option<LaunchKind> {
    match claims.message_type.as_deref() {
        None | Some("LtiResourceLinkRequest") => Some(LaunchKind::ResourceLink),
        Some("LtiDeepLinkingRequest") => Some(LaunchKind::DeepLinking),
        Some(_) => None,
    }
}

/// Determines the Opencast username from the launch claims, using the source
/// the platform is configured with. Returns `None` if that claim is absent, so
/// the caller can reject the launch instead of guessing an identity.
///
/// The source is an admin decision per platform: Canvas sends a trustworthy
/// `preferred_username` (the safe default), while Moodle sends none and needs
/// `Custom` (a `username` custom parameter). `Custom` trusts whoever configures
/// the launch — see the `username_source` docs.
fn resolve_username(claims: &LtiClaims, source: LtiUsernameSource) -> Option<String> {
    match source {
        LtiUsernameSource::PreferredUsername => claims.preferred_username.clone(),
        LtiUsernameSource::Sub => Some(claims.sub.clone()),
        LtiUsernameSource::Custom => claims.custom.as_ref()
            .and_then(|custom| custom.get("username"))
            .and_then(|username| username.as_str())
            .filter(|username| !username.is_empty())
            .map(str::to_owned),
    }
}

/// Fetches and parses the platform's JWKS into verifying keys. Keys we do not
/// understand are skipped.
async fn fetch_platform_jwks(
    platform: &LtiPlatform,
    ctx: &Context,
) -> Result<Vec<jwtea::VerifyingKey>> {
    let uri = platform.keyset_url.as_str().parse::<Uri>().context("invalid keyset URL")?;
    let response = ctx.http_client.get(uri).await?;
    if !response.status().is_success() {
        bail!("platform JWKS endpoint returned status {}", response.status());
    }
    let body = download_body(response.into_body()).await?;
    let jwks: jwtea::Jwks = serde_json::from_slice(&body)
        .context("could not parse platform JWKS")?;
    Ok(jwks.to_verifying_keys().filter_map(|res| res.ok()).collect())
}

/// Picks the page a resource-link launch lands on.
///
/// A specific `target_link_uri` wins: activities created via Deep Linking
/// carry the picked page there. The `series` custom parameter is only the
/// fallback for manually configured placements — it is typically set
/// tool-wide, so it must not override a specific target (otherwise every
/// launch of that tool would land on the same series, no matter what was
/// picked). Without either, the launch lands on the start page.
fn landing_target(target_link_uri: &str, custom_series: Option<&str>, base: &str) -> String {
    let resolved = resolve_target(target_link_uri, base);
    if resolved != base {
        return resolved;
    }
    match custom_series {
        Some(series) => series_landing(base, series),
        None => resolved,
    }
}

/// Picks a safe in-Tobira redirect target for a launch, defaulting to `base`
/// (the start page). It guards against three things:
///
/// - **Open redirects:** the target must be `base` followed by a path starting
///   with `/`. A bare string prefix is not enough — `https://<base>.evil.com/…`
///   also starts with `base` — so the boundary `/` is what makes this safe.
/// - **Bouncing into our own endpoints:** platforms commonly default
///   `target_link_uri` to the tool URL, which for us is `/~lti/launch` — a
///   POST-only endpoint that a browser GET would 404 on. `/~lti/` targets
///   therefore fall back to the start page (this is the normal case).
/// - **Header injection:** control characters are rejected, so the result is
///   always a valid `Location` header value.
fn resolve_target(target: &str, base: &str) -> String {
    match target.strip_prefix(base).filter(|path| path.starts_with('/')) {
        Some(path) if path.starts_with("/~lti/") => base.to_owned(),
        Some(path) if !path.bytes().any(|b| b.is_ascii_control()) => target.to_owned(),
        _ => {
            warn!("LTI launch: unusable target_link_uri; falling back to the start page");
            base.to_owned()
        }
    }
}

/// Builds the URL of a Tobira series page from an Opencast series ID, using
/// Tobira's direct series route (`/!s/:<opencast-id>`).
fn series_landing(base: &str, opencast_series_id: &str) -> String {
    format!("{base}/!s/:{opencast_series_id}")
}

/// The subset of LTI 1.3 launch claims we read. Only the fields needed for the
/// MVP (verification + identity) are modelled.
#[derive(Debug, Deserialize)]
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

    /// What kind of message this launch is (resource link, deep linking, …).
    #[serde(rename = "https://purl.imsglobal.org/spec/lti/claim/message_type")]
    message_type: Option<String>,

    /// Settings of a Deep Linking request; only present on those.
    #[serde(rename = "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings")]
    deep_linking_settings: Option<deeplink::DeepLinkingSettingsClaim>,

    #[serde(rename = "https://purl.imsglobal.org/spec/lti/claim/deployment_id")]
    deployment_id: String,

    /// Custom parameters configured for this placement in the platform. The MVP
    /// reads `custom["series"]` (an Opencast series ID) to land on that series.
    #[serde(rename = "https://purl.imsglobal.org/spec/lti/claim/custom")]
    custom: Option<BTreeMap<String, serde_json::Value>>,
}

/// A JSON value that may be a single item or an array of them (e.g. `aud`).
#[derive(Debug, Deserialize)]
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
pub(crate) struct LtiToolKey {
    /// Signs the Deep Linking response (and later the NRPS `client_assertion`).
    keypair: KeyPair,

    /// The public JWKS document served at `/~lti/jwks`.
    jwks: String,

    /// The key id, included in headers of JWTs we sign so the platform picks
    /// the right key from our JWKS.
    kid: String,

    /// Whether the key was generated for this process (no `auth.lti.tool_key`
    /// configured). Signing with an ephemeral key gets a warning: with more
    /// than one Tobira process, `/~lti/jwks` would serve a different key set
    /// depending on which process answers, so verification can fail.
    ephemeral: bool,
}

impl LtiToolKey {
    /// Loads the key from `auth.lti.tool_key` (a PEM PKCS#8 RSA private key),
    /// or generates a fresh one per process if the option is not set —
    /// mirroring how `auth.jwt.secret_key` behaves.
    pub(crate) fn load(config: &LtiConfig) -> Result<Self> {
        let Some(path) = &config.tool_key else {
            return Ok(Self::generate());
        };

        let pem = std::fs::read(path)
            .with_context(|| format!("failed to read `auth.lti.tool_key` file '{}'",
                path.display()))?;
        Self::from_pem(&pem)
    }

    fn from_pem(pem: &[u8]) -> Result<Self> {
        let (_label, pkcs8) = pem_rfc7468::decode_vec(pem)
            .context("`auth.lti.tool_key` is not a valid PEM document")?;
        let keypair = KeyPair::from_pkcs8(&pkcs8)
            .map_err(|e| anyhow!("`auth.lti.tool_key` is not a valid RSA key: {e}"))?;
        Ok(Self::from_keypair(keypair, false))
    }

    fn generate() -> Self {
        let keypair = KeyPair::generate(KeySize::Rsa2048)
            .expect("failed to generate LTI tool RSA key");
        Self::from_keypair(keypair, true)
    }

    fn from_keypair(keypair: KeyPair, ephemeral: bool) -> Self {
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

        Self { keypair, jwks, kid, ephemeral }
    }

    /// Signs `payload` as an RS256 JWT with this key. The platform verifies
    /// the signature against `/~lti/jwks`.
    pub(super) fn sign_jwt(&self, payload: &serde_json::Value) -> String {
        if self.ephemeral {
            warn!("Signing an LTI JWT with an ephemeral tool key. Set `auth.lti.tool_key` \
                so signatures stay verifiable across restarts and processes.");
        }

        let header = serde_json::json!({ "alg": "RS256", "typ": "JWT", "kid": self.kid });
        let mut jwt = format!(
            "{}.{}",
            BASE64_URL_SAFE_NO_PAD.encode(header.to_string()),
            BASE64_URL_SAFE_NO_PAD.encode(payload.to_string()),
        );

        let mut signature = vec![0; self.keypair.public_modulus_len()];
        self.keypair
            .sign(
                &aws_lc_rs::signature::RSA_PKCS1_SHA256,
                &aws_lc_rs::rand::SystemRandom::new(),
                jwt.as_bytes(),
                &mut signature,
            )
            .expect("failed to RS256-sign LTI JWT");
        jwt.push('.');
        jwt.push_str(&BASE64_URL_SAFE_NO_PAD.encode(&signature));
        jwt
    }
}

/// Handles `GET /~lti/jwks`: serves the tool's public keys (JWKS) so platforms
/// can register Tobira and verify JWTs it signs (Deep Linking response, service
/// grants). Only served when LTI is enabled.
pub(crate) async fn handle_jwks(ctx: &Context) -> Response {
    if !ctx.config.auth.lti.enabled {
        return http::response::not_found();
    }
    Response::builder()
        .header(header::CONTENT_TYPE, "application/json")
        .body(ByteBody::new(ctx.lti_tool_key.jwks.clone().into()))
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

    #[test]
    fn series_landing_uses_direct_opencast_route() {
        assert_eq!(
            series_landing("https://tobira.example.org", "abc-123"),
            "https://tobira.example.org/!s/:abc-123",
        );
    }

    /// Builds claims from the given user-identifying fields, filling in the
    /// rest with values a launch would always carry.
    fn claims_with(extra: serde_json::Value) -> LtiClaims {
        let mut json = serde_json::json!({
            "iss": "https://moodle.example.org",
            "aud": "client-a",
            "sub": "3",
            "https://purl.imsglobal.org/spec/lti/claim/deployment_id": "1",
        });
        let (serde_json::Value::Object(base), serde_json::Value::Object(extra))
            = (&mut json, extra) else { panic!("expected JSON objects") };
        base.extend(extra);

        serde_json::from_value(json).expect("claims should deserialize")
    }

    #[test]
    fn tool_key_loads_from_pem_and_rejects_garbage() {
        use aws_lc_rs::encoding::{AsDer, Pkcs8V1Der};

        // Round-trip a freshly generated key through PEM, the same shape an
        // operator's openssl-generated `auth.lti.tool_key` file would have.
        let generated = KeyPair::generate(KeySize::Rsa2048).unwrap();
        let der = AsDer::<Pkcs8V1Der>::as_der(&generated).unwrap();
        let pem = pem_rfc7468::encode_string(
            "PRIVATE KEY",
            pem_rfc7468::LineEnding::LF,
            der.as_ref(),
        ).unwrap();

        let key = LtiToolKey::from_pem(pem.as_bytes()).unwrap();
        assert!(!key.ephemeral);
        // The JWKS must describe the loaded key, same shape as a generated one.
        let doc: serde_json::Value = serde_json::from_str(&key.jwks).unwrap();
        assert_eq!(doc["keys"][0]["kty"], "RSA");
        assert!(doc["keys"][0]["n"].as_str().unwrap().len() > 300);

        assert!(LtiToolKey::from_pem(b"not a pem").is_err());
        assert!(LtiToolKey::generate().ephemeral);
    }

    /// The round trip a platform performs: our signed JWT must verify against
    /// our own published JWKS, using the same verification code (`jwtea`)
    /// that we use for incoming tokens.
    #[tokio::test]
    async fn signed_jwt_verifies_against_own_jwks() {
        let key = LtiToolKey::generate();
        let now = chrono::Utc::now().timestamp();
        let jwt = key.sign_jwt(&serde_json::json!({ "exp": now + 60, "answer": 42 }));

        let jwks: jwtea::Jwks = serde_json::from_str(&key.jwks).unwrap();
        let keys: Vec<_> = jwks.to_verifying_keys().filter_map(|k| k.ok()).collect();
        assert!(!keys.is_empty());

        let validator = jwtea::BasicValidator { allowed_clock_skew: 10 };
        let claims = jwtea::RawJwt::new(jwt).unwrap()
            .decode::<(), serde_json::Value, _>(
                keys.as_slice(),
                &validator,
                |_header, payload| payload.extra_fields,
            )
            .await
            .expect("own JWT must verify against own JWKS");
        assert_eq!(claims["answer"], 42);

        // A signature from a *different* key must be rejected.
        let other = LtiToolKey::generate();
        let forged = other.sign_jwt(&serde_json::json!({ "exp": now + 60 }));
        assert!(jwtea::RawJwt::new(forged).unwrap()
            .decode::<(), serde_json::Value, _>(
                keys.as_slice(),
                &validator,
                |_header, payload| payload.extra_fields,
            )
            .await
            .is_err());
    }

    #[test]
    fn launch_kind_classifies_message_types() {
        let with_type = |ty: &str| claims_with(serde_json::json!({
            "https://purl.imsglobal.org/spec/lti/claim/message_type": ty,
        }));

        // Absent is treated as a resource link (leniency for existing setups).
        assert_eq!(
            launch_kind(&claims_with(serde_json::json!({}))),
            Some(LaunchKind::ResourceLink),
        );
        assert_eq!(
            launch_kind(&with_type("LtiResourceLinkRequest")),
            Some(LaunchKind::ResourceLink),
        );
        assert_eq!(
            launch_kind(&with_type("LtiDeepLinkingRequest")),
            Some(LaunchKind::DeepLinking),
        );
        // Unknown types must be rejected by the caller.
        assert_eq!(launch_kind(&with_type("LtiSubmissionReviewRequest")), None);
    }

    #[test]
    fn landing_prefers_specific_target_over_series_parameter() {
        let base = "https://tobira.example.org";

        // A Deep-Linking-created activity: its target names the picked page,
        // and a tool-wide `series` parameter must NOT override it.
        assert_eq!(
            landing_target("https://tobira.example.org/!s/:picked", Some("toolwide"), base),
            "https://tobira.example.org/!s/:picked",
        );
        // Manually configured placement: target is just the tool URL, so the
        // `series` parameter decides the landing.
        assert_eq!(
            landing_target("https://tobira.example.org/~lti/launch", Some("toolwide"), base),
            "https://tobira.example.org/!s/:toolwide",
        );
        // Neither: start page.
        assert_eq!(
            landing_target("https://tobira.example.org/~lti/launch", None, base),
            base,
        );
    }

    #[test]
    fn username_default_source_uses_preferred_username() {
        use LtiUsernameSource::PreferredUsername;
        // Present → used.
        assert_eq!(
            resolve_username(
                &claims_with(serde_json::json!({ "preferred_username": "rrolf" })),
                PreferredUsername,
            ),
            Some("rrolf".to_owned()),
        );
        // Absent → None (the launch is rejected rather than guessing an identity).
        assert_eq!(
            resolve_username(&claims_with(serde_json::json!({})), PreferredUsername),
            None,
        );
    }

    #[test]
    fn username_sub_source_uses_subject() {
        assert_eq!(
            resolve_username(&claims_with(serde_json::json!({})), LtiUsernameSource::Sub),
            Some("3".to_owned()),
        );
    }

    #[test]
    fn resolve_target_lands_on_start_page_for_lti_endpoints_and_open_redirects() {
        let base = "https://tobira.example.org";

        // Moodle's default `target_link_uri` is the tool URL (`/~lti/launch`),
        // which must not be handed back to the browser.
        assert_eq!(resolve_target("https://tobira.example.org/~lti/launch", base), base);
        // Anything outside Tobira is refused (no open redirect).
        assert_eq!(resolve_target("https://evil.example.org/phish", base), base);
        // A host that merely *starts with* the base must not pass: without the
        // path boundary this would be an open redirect.
        assert_eq!(resolve_target("https://tobira.example.org.evil.com/phish", base), base);
        // Control characters (header injection) are rejected.
        assert_eq!(resolve_target("https://tobira.example.org/a\r\nb", base), base);
        // A real in-Tobira page is kept.
        assert_eq!(
            resolve_target("https://tobira.example.org/!s/:abc-123", base),
            "https://tobira.example.org/!s/:abc-123",
        );
    }

    #[test]
    fn username_custom_source_reads_custom_parameter_only() {
        use LtiUsernameSource::Custom;
        let with_custom = |username| claims_with(serde_json::json!({
            // A `preferred_username` must NOT be used when the source is Custom.
            "preferred_username": "from-claim",
            "https://purl.imsglobal.org/spec/lti/claim/custom": { "username": username },
        }));

        assert_eq!(
            resolve_username(&with_custom("from-custom"), Custom),
            Some("from-custom".to_owned()),
        );
        // A blank (e.g. unsubstituted) value yields None, not the standard claim.
        assert_eq!(resolve_username(&with_custom(""), Custom), None);
        // No custom parameter at all → None.
        assert_eq!(resolve_username(&claims_with(serde_json::json!({})), Custom), None);
    }
}
