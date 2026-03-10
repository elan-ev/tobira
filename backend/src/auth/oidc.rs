// TODOs:
// - Cache discovery info?
// - Cache JWKS?

use std::collections::BTreeMap;

use base64::{Engine, prelude::BASE64_URL_SAFE_NO_PAD};
use cookie::Cookie;
use hyper::{Method, Request, StatusCode, Uri, body::Incoming, header};
use jwtea::{Jwks, RawJwt};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

use crate::{
    auth::{User, all_cookies_of, config::OidcConfig},
    http::{Context, Response},
    prelude::*,
    util::{ByteBody, FullBodyExt, HttpUrl, ResponseExt, download_body, gen_random_bytes_crypto},
};


const STATE_COOKIE: &str = "tobira-oidc-state";

fn state_cookie_set(value: &str) -> Cookie<'_> {
    Cookie::build((STATE_COOKIE, value))
        .http_only(true)
        .secure(true)
        .path("/")
        .same_site(cookie::SameSite::Lax)
        .build()
}

fn state_cookie_unset() -> Cookie<'static> {
    Cookie::build((STATE_COOKIE, ""))
        .max_age(time::Duration::ZERO)
        .secure(true)
        .path("/")
        .http_only(true)
        .same_site(cookie::SameSite::Lax)
        .build()
}

macro_rules! discover_info_or_redirect_to_error_page {
    ($ctx:expr) => {
        match DiscoveryInfo::fetch($ctx).await {
            Ok(v) => v,
            Err(e) => {
                warn!("Failed to fetch OpenID configuration: {e:?}");
                return redirect_to_error_page_custom("tobira:unreachable");
            }
        }
    };
}

/// Handles GET requests to `/~oidc/login`.
pub(crate) async fn handle_login(
    _req: Request<Incoming>,
    ctx: &Context,
) -> Response {
    let discover_info = discover_info_or_redirect_to_error_page!(ctx);

    let state = BASE64_URL_SAFE_NO_PAD.encode(gen_random_bytes_crypto::<16>().expose_secret());
    let target = discover_info.authorization_endpoint(&[
        ("response_type", "code"),
        ("client_id", ctx.config.auth.oidc.unwrap_client_id()),
        ("redirect_uri", &callback_url(ctx).to_string()),
        ("scope", "openid email"), // TODO
        ("state", &state),
    ]);

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, target.to_string())
        .header(header::SET_COOKIE, state_cookie_set(&state).to_string())
        .body(ByteBody::empty())
        .unwrap()
}

/// Handles GET requests to `/~oidc/callback`.
pub(crate) async fn handle_callback(
    req: Request<Incoming>,
    ctx: &Context,
) -> Response {
    // ----- Read and verify request ----------------------------------------------------------
    let params = form_urlencoded::parse(req.uri().query().unwrap_or_default().as_bytes())
        .collect::<BTreeMap<_, _>>();

    // If the IdP reported an error, we log it and forward the user to a
    // frontend route that shows a nice error message.
    if let Some(error) = params.get("error") {
        debug!(
            %error,
            error_description = ?params.get("error_description"),
            error_uri = ?params.get("error_uri"),
            "OIDC error in '/~oidc/callback'",
        );

        let target_params = query_params(params.iter().filter(|(key, _)| key.as_ref() != "state"));
        return redirect_to_error_page(target_params);
    }

    // Make sure the `state` is the same as the one in the cookie. If any error
    // occurs, we also redirect to the frontend error route.
    let state_param = params.get("state")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let state_cookie = all_cookies_of(req.headers())
        .find(|c| c.name() == STATE_COOKIE)
        .map(|c| c.value().to_owned());
    match (state_param, state_cookie) {
        (None, _) => {
            debug!("OIDC error in '/~oidc/callback': state parameter not set");
            return redirect_to_error_page_custom("tobira:state_missing");
        }
        (_, None) => {
            debug!("OIDC error in '/~oidc/callback': state cookie not set");
            return redirect_to_error_page_custom("tobira:state_missing");
        }
        (Some(param), Some(cookie)) if param != cookie => {
            debug!("OIDC error in '/~oidc/callback': state mismatch between cookie and param");
            return redirect_to_error_page_custom("tobira:state_mismatch");
        }
        (Some(_), Some(_)) => {} // All good
    }

    // Get code from request
    let Some(code) = params.get("code").map(|s| s.trim()).filter(|s| !s.is_empty()) else {
        debug!("OIDC error in '/~oidc/callback': code missing");
        return redirect_to_error_page_custom("tobira:code_missing");
    };



    // ----- Talk to IdP directly ---------------------------------------------------------------
    let discover_info = discover_info_or_redirect_to_error_page!(ctx);
    let user = match fetch_token(code, &discover_info, ctx).await {
        Ok(u) => u,
        Err(e) => {
            debug!("failed to do fetch OIDC token: {e:?}");
            return redirect_to_error_page_custom("tobira:token_exchange_failed");
        }
    };

    // All worked -> create user session
    let cookie = match super::create_session_with_cookies(user, ctx).await {
        Ok(c) => c,
        Err(r) => return r,
    };

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, "/~session")
        .header(header::SET_COOKIE, state_cookie_unset().to_string())
        .header(header::SET_COOKIE, cookie.to_string())
        .body(ByteBody::empty())
        .unwrap()
}

/// Exchange the `code` for tokens.
async fn fetch_token(code: &str, discover_info: &DiscoveryInfo, ctx: &Context) -> Result<User> {
    let body = query_params([
        ("grant_type", "authorization_code"),
        ("code", code),
        ("client_id", ctx.config.auth.oidc.unwrap_client_id()),
        ("client_secret", ctx.config.auth.oidc.unwrap_client_secret().expose_secret()),
        ("redirect_uri", &callback_url(ctx).to_string()),
    ]);
    let req = Request::builder()
        .method(Method::POST)
        .uri(discover_info.token_endpoint.as_str())
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body.into())
        .unwrap();

    #[derive(Debug, serde::Deserialize)]
    struct TokenEndpointResponse {
        /// Required by OAuth 2.0 spec.
        #[allow(dead_code)]
        access_token: String,

        /// Required by the OIDC spec (assuming we pass `openid` scope), always
        /// a JWT.
        id_token: RawJwt<String>,
    }

    // Make request to token endpoint
    let response = ctx.http_client.request(req).await?;
    let (_parts, body) = download_json::<TokenEndpointResponse>(response).await?;


    // Download JWKS and then decode & verify ID token.
    let keys = discover_info.fetch_jwks(ctx).await?;
    let payload = body.id_token.decode::<(), IdTokenPayload, _>(
        keys.as_slice(),
        &IdTokenValidator::new(&ctx.config.auth.oidc),
        |_header, payload| payload.extra_fields,
    ).await?;


    // TODO: whole bunch of TODOs!
    let user = User {
        display_name: payload.name.unwrap().into(),
        email: payload.email.map(Into::into),
        username: payload.preferred_username.unwrap().into(),
        user_role: "TODO".into(),
        roles: Default::default(),
        user_realm_handle: None,
    };

    Ok(user)
}

/// See OIDC spec section 2.
/// https://openid.net/specs/openid-connect-core-1_0-final.html#IDToken
#[derive(Debug, serde::Deserialize)]
struct IdTokenPayload {
    iss: String,
    sub: String,
    aud: MaybeArray<String>,
    azp: Option<String>,

    // User info
    name: Option<String>,
    preferred_username: Option<String>,
    email: Option<String>,

    #[serde(flatten)]
    rest: serde_json::Map<String, serde_json::Value>,
}

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

struct IdTokenValidator<'a> {
    basic: jwtea::BasicValidator,
    client_id: &'a str,
    issuer_url: &'a HttpUrl,
}

impl<'a> IdTokenValidator<'a> {
    fn new(config: &'a OidcConfig) -> Self {
        Self {
            basic: jwtea::BasicValidator { allowed_clock_skew: 10 },
            client_id: config.unwrap_client_id(),
            issuer_url: config.unwrap_issuer_url(),
        }
    }
}

impl<H> jwtea::Validator<H, IdTokenPayload> for IdTokenValidator<'_> {
    fn validate(
        &self,
        header: &jwtea::Header<H>,
        payload: &jwtea::Payload<IdTokenPayload>,
    ) -> Result<(), jwtea::Error> {
        self.basic.validate(header, payload)?;
        if !payload.extra_fields.aud.as_slice().iter().any(|aud| aud == self.client_id) {
            return Err(jwtea::Error::ValidationError("'aud' does not match client ID".into()));
        }
        if payload.extra_fields.azp.as_ref().is_some_and(|azp| azp != self.client_id) {
            return Err(jwtea::Error::ValidationError("'azp' does not match client ID".into()));
        }
        if payload.extra_fields.iss != self.issuer_url.as_str() {
            return Err(jwtea::Error::ValidationError("'iss' does not match issuer URL".into()));
        }
        Ok(())
    }
}


/// Builds a query string.
fn query_params(iter: impl IntoIterator<Item = (impl AsRef<str>, impl AsRef<str>)>) -> String {
    let mut params = form_urlencoded::Serializer::new(String::new());
    params.extend_pairs(iter);
    params.finish()
}

/// Redirects the user to `/~oidc/error`, which is a frontend route, showing
/// an error message to the user, depending on the parameters.
fn redirect_to_error_page(params: String) -> Response {
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, format!("/~oidc/error?{params}"))
        .header(header::SET_COOKIE, state_cookie_unset().to_string())
        .body(ByteBody::empty())
        .unwrap()
}

/// Like `redirect_to_error_page`, but only setting the `error` parameter to the
/// given string. Used for our own error cases (not part of the OIDC standard).
fn redirect_to_error_page_custom(error_code: &str) -> Response {
    redirect_to_error_page(query_params([("error", error_code)]))
}

impl OidcConfig {
    fn unwrap_client_id(&self) -> &str {
        self.client_id.as_deref().expect("oidc.client_id not set")
    }
    fn unwrap_client_secret(&self) -> &SecretString {
        self.client_secret.as_ref().expect("oidc.client_secret not set")
    }
    fn unwrap_issuer_url(&self) -> &HttpUrl {
        self.issuer_url.as_ref().expect("oidc.issuer_url not set")
    }
}

/// Returns our own callback URL.
fn callback_url(ctx: &Context) -> Uri {
    ctx.config.general.tobira_url.clone()
        .with_path_and_query("/~oidc/callback")
}


/// Info returned by `/.well-known/openid-configuration`.
///
/// See https://openid.net/specs/openid-connect-discovery-1_0.html
/// I assume that all URLs are always absolute (contain scheme and authority),
/// though I couldn't find any part of the spec saying this.
#[derive(Deserialize)]
struct DiscoveryInfo {
    /// > REQUIRED. URL of the OP's OAuth 2.0 Authorization Endpoint. This URL
    /// > MUST use the https scheme and MAY contain port, path, and query
    /// > parameter components.
    authorization_endpoint: HttpUrl,

    /// > URL of the OP's OAuth 2.0 Token Endpoint. This is REQUIRED unless only
    /// > the Implicit Flow is used. This URL MUST use the https scheme and MAY
    /// > contain port, path, and query parameter components.
    ///
    /// Since we require the authorization code flow, we can also require this.
    token_endpoint: HttpUrl,

    /// > REQUIRED. URL of the OP's JWK Set document, which MUST use the https
    /// > scheme.
    jwks_uri: HttpUrl,
}

impl DiscoveryInfo {
    async fn fetch(ctx: &Context) -> Result<Self> {
        // According to the specification, simply concatting to the issuer URL
        // is fine, with no regard for trailing slashes.
        // https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfig
        let issuer = ctx.config.auth.oidc.unwrap_issuer_url();
        let url = format!("{issuer}/.well-known/openid-configuration");

        trace!(%url, "fetching OIDC discovery info");
        let response = ctx.http_client.get(url.parse()?).await?;
        let (_parts, out) = download_json(response).await
            .context("failed to fetch OpenID configuration (discover)")?;

        // We do not verify the things demanded by the spec (e.g. https, no
        // query) since we need to trust the IdP anyway.
        Ok(out)
    }

    /// Authorization endpoint with the given extra query parameters.
    fn authorization_endpoint(&self, params: &[(&str, &str)]) -> HttpUrl {
        let mut out = self.authorization_endpoint.clone();
        out.query_pairs_mut().extend_pairs(params);
        out
    }

    async fn fetch_jwks(&self, ctx: &Context) -> Result<Vec<jwtea::VerifyingKey>> {
        let uri = self.jwks_uri.as_str().parse::<Uri>().context("invalid JWKS url")?;
        let response = ctx.http_client.get(uri).await?;
        let (_, jwks) = download_json::<Jwks>(response).await?;

        // We ignore keys that we do not understand or that are buggy.
        let keys = jwks.to_verifying_keys().filter_map(|res| res.ok()).collect::<Vec<_>>();
        Ok(keys)
    }
}

/// Downloads and deserializes a JSON body from the `response`.
async fn download_json<T: for<'a> Deserialize<'a>>(
    response: hyper::Response<Incoming>,
) -> Result<(hyper::http::response::Parts, T)> {
    if response.headers().get(header::CONTENT_TYPE).is_none_or(|h| h != "application/json") {
        bail!("response Content-Type is not 'application/json'");
    }

    let (parts, body) = response.into_parts();
    let body = download_body(body).await?;

    let log_body = || {
        if tracing::event_enabled!(tracing::Level::TRACE) {
            match serde_json::from_slice::<serde_json::Value>(&body) {
                Ok(json) => trace!("Body: {json:#?}"),
                Err(_) => trace!("Body: {:?}", String::from_utf8_lossy(&body)),
            }
        }
    };

    if !parts.status.is_success() {
        log_body();
        bail!("non 2xx status returned: {}", parts.status);
    }

    let body = serde_json::from_slice::<T>(&body)
        .context("failed to deserialize JSON")
        .inspect_err(|_| log_body())?;

    Ok((parts, body))
}
