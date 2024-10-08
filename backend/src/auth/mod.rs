use std::{borrow::Cow, collections::HashSet, time::Duration};

use base64::Engine;
use cookie::Cookie;
use deadpool_postgres::Client;
use hyper::{http::HeaderValue, HeaderMap, Request, StatusCode};
use once_cell::sync::Lazy;
use secrecy::ExposeSecret;
use serde::Deserialize;
use tokio_postgres::Error as PgError;

use crate::{
    api::err::{not_authorized, ApiError},
    db::util::select,
    http::{response, Context, Response},
    prelude::*,
    util::{download_body, ByteBody},
};


mod cache;
mod config;
mod handlers;
mod session_id;
mod jwt;

use self::config::CallbackCacheDuration;
pub(crate) use self::{
    cache::Caches,
    config::{AuthConfig, AuthSource, CallbackUri},
    session_id::SessionId,
    jwt::{JwtConfig, JwtContext},
    handlers::{handle_post_session, handle_delete_session, handle_post_login},
};


/// Users with this role can do anything as they are the global Opencast
/// administrator.
pub(crate) const ROLE_ADMIN: &str = "ROLE_ADMIN";

const ROLE_ANONYMOUS: &str = "ROLE_ANONYMOUS";
const ROLE_USER: &str = "ROLE_USER";

const SESSION_COOKIE: &str = "tobira-session";

// Auth headers
const AUTH_HEADER_USERNAME: &str = "x-tobira-username";
const AUTH_HEADER_DISPLAY_NAME: &str = "x-tobira-user-display-name";
const AUTH_HEADER_EMAIL: &str = "x-tobira-user-email";
const AUTH_HEADER_ROLES: &str = "x-tobira-user-roles";



/// Information about whether or not, and if so how
/// someone or something talking to Tobira is authenticated
#[derive(PartialEq, Eq)]
pub(crate) enum AuthContext {
    Anonymous,
    TrustedExternal,
    User(User),
}

/// Data about a user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct User {
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) email: Option<String>,
    pub(crate) roles: HashSet<String>,
    pub(crate) user_role: String,
}

impl AuthContext {
    pub(crate) async fn new(
        headers: &HeaderMap,
        db: &Client,
        ctx: &Context,
    ) -> Result<Self, Response> {
        if let Some(given_key) = headers.get("x-tobira-trusted-external-key") {
            if let Some(trusted_key) = &ctx.config.auth.trusted_external_key {
                if trusted_key.expose_secret() == given_key {
                    return Ok(Self::TrustedExternal);
                }
            }
        }

        User::new(headers, db, ctx)
            .await?
            .map_or(Self::Anonymous, Self::User)
            .pipe(Ok)
    }

    /// Returns `true` if this is a normally authenticated user. Note that
    /// usually, roles should be checked instead.
    pub(crate) fn is_user(&self) -> bool {
        matches!(self, Self::User(_))
    }

    /// Returns a representation of the optional username useful for logging.
    pub(crate) fn debug_log_username(&self) -> Cow<'static, str> {
        match self {
            Self::Anonymous => "anonymous".into(),
            Self::TrustedExternal => "trusted external".into(),
            Self::User(user) => format!("'{}'", user.username).into(),
        }
    }

    pub fn required_trusted_external(&self) -> Result<(), ApiError> {
        if *self != Self::TrustedExternal {
            return Err(not_authorized!("only trusted external applications can use this mutation"));
        }
        Ok(())
    }
    
}

impl User {
    /// Obtains the current user from the given request, depending on
    /// `auth.source`. The `users` table is updated if appropriate.
    pub(crate) async fn new(
        headers: &HeaderMap,
        db: &Client,
        ctx: &Context,
    ) -> Result<Option<Self>, Response> {
        let mut out = match &ctx.config.auth.source {
            AuthSource::None => None,
            AuthSource::TobiraSession => Self::from_session(headers, db, &ctx.config.auth).await?,
            AuthSource::TrustAuthHeaders => Self::from_auth_headers(headers, &ctx.config.auth),
            AuthSource::Callback(uri) => {
                Self::from_auth_callback(headers, uri, ctx).await?
            }
        };

        if let Some(user) = &mut out {
            user.add_default_roles();
            // TODO: consider not awaiting here. The result is not important and
            // we can finish the rest of the API in the meantime.
            ctx.auth_caches.user.upsert_user_info(user, db).await;
        }


        Ok(out)
    }

    /// Handler for `auth.source = "trust-auth-headers"`. Tries to read user
    /// data auth headers (`x-tobira-username`, ...). If the username or
    /// display name are not defined, returns `None`.
    pub(crate) fn from_auth_headers(headers: &HeaderMap, auth_config: &AuthConfig) -> Option<Self> {
        // Helper function to read and base64 decode a header value.
        let get_header = |header_name: &str| -> Option<String> {
            let value = headers.get(header_name)?;
            let decoded = base64decode(value.as_bytes())
                .map_err(|e| warn!("header '{}' is set but not valid base64: {}", header_name, e))
                .ok()?;

            String::from_utf8(decoded)
                .map_err(|e| warn!("header '{}' is set but decoded base64 is not UTF8: {}", header_name, e))
                .ok()
        };

        // Get required headers. If these are not set and valid, we treat it as
        // if there is no user session.
        let username = get_header(AUTH_HEADER_USERNAME)?;
        let display_name = get_header(AUTH_HEADER_DISPLAY_NAME)?;
        let email = get_header(AUTH_HEADER_EMAIL);

        // Get roles from the user.
        let roles: HashSet<_> = get_header(AUTH_HEADER_ROLES)?
            .split(',')
            .map(|role| role.trim().to_owned())
            .collect();
        let user_role = auth_config
            .find_user_role(&username, roles.iter().map(|s| s.as_str()))?
            .to_owned();

        Some(Self { username, display_name, email, roles, user_role })
    }

    /// Handler for `auth.source = "tobira-session"`. Tries to load user data
    /// from a DB session referred to in a session cookie.
    async fn from_session(
        headers: &HeaderMap,
        db: &Client,
        auth_config: &AuthConfig,
    ) -> Result<Option<Self>, Response> {
        // Try to get a session ID from the cookie.
        let session_id = match SessionId::from_headers(headers) {
            None => return Ok(None),
            Some(id) => id,
        };

        // Check if such a session exists in the DB.
        let (selection, mapping) = select!(username, display_name, roles, email);
        let query = format!(
            "select {selection} from user_sessions \
                where id = $1 \
                and extract(epoch from now() - created) < $2::double precision"
        );
        let session_duration = auth_config.session.duration.as_secs_f64();
        let row = match db.query_opt(&query, &[&session_id, &session_duration]).await {
            Ok(None) => return Ok(None),
            Ok(Some(row)) => row,
            Err(e) => {
                error!("DB error when checking user session: {}", e);
                return Err(response::internal_server_error());
            }
        };

        let username: String = mapping.username.of(&row);
        let roles = mapping.roles.of::<Vec<String>>(&row);
        let user_role = auth_config
            .find_user_role(&username, roles.iter().map(|s| s.as_str()))
            .expect("user session without user role")
            .to_owned();

        Ok(Some(Self {
            username,
            display_name: mapping.display_name.of(&row),
            email: mapping.email.of(&row),
            roles: roles.into_iter().collect(),
            user_role,
        }))
    }

    /// Handler for value `auth.source = "callback:..."`. Forwards the relevant
    /// request headers to the callback, which returns user info.
    pub(crate) async fn from_auth_callback(
        headers: &HeaderMap,
        callback_url: &CallbackUri,
        ctx: &Context,
    ) -> Result<Option<Self>, Response> {
        // TODO: instead of creating a new header map, we could take the old one
        // and just remove the headers we are not interested in. This is kind
        // of blocked by this: https://github.com/hyperium/http/issues/541

        let mut req = Request::new(ByteBody::empty());
        for h in ctx.config.auth.callback.relevant_headers.iter().flatten() {
            for value in headers.get_all(h) {
                req.headers_mut().append(h.clone(), value.clone());
            }
        }

        if let Some(relevant_cookies) = &ctx.config.auth.callback.relevant_cookies {
            headers.get_all(hyper::header::COOKIE)
                .into_iter()
                .filter_map(|value| value.to_str().ok()) // Ignore non-UTF8 cookies
                .flat_map(|value| Cookie::split_parse(value))
                .filter_map(|r| r.ok()) // Ignore unparsable cookies
                .filter(|cookie| relevant_cookies.iter().any(|rc| cookie.name() == rc))
                .for_each(|cookie| {
                    // Unwrap is fine: this value was a `HeaderValue` before.
                    let value = HeaderValue::from_bytes(cookie.to_string().as_bytes()).unwrap();
                    req.headers_mut().append(hyper::header::COOKIE, value);
                });
        }

        // If the incoming request contains none of the specified headers, we
        // treat it as unauthenticated.
        if req.headers().is_empty() {
            trace!("None of the relevant headers or cookies are in the incoming requests \
                -> treating as unauthenticated");
            return Ok(None);
        }

        // Check cache.
        let mut header_copy = None;
        if let CallbackCacheDuration::Enabled(duration) = ctx.config.auth.callback.cache_duration {
            header_copy = Some(req.headers().clone());
            if let Some(user) = ctx.auth_caches.callback.get(req.headers(), duration).await {
                return Ok(user);
            }
        }

        // Cache miss or disabled cache: ask the callback.
        let out = Self::from_callback_impl(req, callback_url, ctx).await?;

        // Insert into cache
        if let CallbackCacheDuration::Enabled(_) = ctx.config.auth.callback.cache_duration {
            ctx.auth_caches.callback.insert(header_copy.unwrap(), out.clone()).await;
        }

        Ok(out)
    }

    /// Impl for `callback:...` and `login-callback:...`.
    pub async fn from_callback_impl(
        mut req: Request<ByteBody>,
        callback_url: &CallbackUri,
        ctx: &Context,
    ) -> Result<Option<Self>, Response> {
        trace!("Sending request to callback '{}'", req.uri());

        *req.uri_mut() = callback_url.uri().clone();
        let res = match callback_url {
            CallbackUri::Tcp(_) => ctx.http_client.request(req),
            CallbackUri::Uds(_) => ctx.uds_http_client.request(req),
        };

        // Send request and download response.
        let response = res.await.map_err(|e| {
            // TODO: maybe limit how quickly that can be logged?
            let e = anyhow::Error::from(e);
            error!("Error contacting auth callback: {e:#}");
            callback_bad_gateway()
        })?;
        let (parts, body) = response.into_parts();
        let body = download_body(body).await.map_err(|e| {
            let e = anyhow::Error::from(e);
            error!("Error downloading body from auth callback: {e:#}");
            callback_bad_gateway()
        })?;


        if parts.status != StatusCode::OK {
            error!("Auth callback replied with {} (which is unexpected)", parts.status);
            return Err(callback_bad_gateway())
        }

        #[derive(Debug, Deserialize)]
        #[serde(tag = "outcome", rename_all = "kebab-case")]
        enum CallbackResponse {
            // Duplicating `User` fields here as this defines a public API, that
            // has to stay stable.
            #[serde(rename_all = "camelCase")]
            User {
                username: String,
                display_name: String,
                email: Option<String>,
                user_role: String,
                roles: HashSet<String>,
            },
            NoUser,
            // TODO: maybe add "redirect"?
        }

        // Note: this will also fail if `body` is not valid UTF-8.
        let deserialized = serde_json::from_slice::<CallbackResponse>(&body);
        if let Ok(v) = &deserialized {
            trace!("Auth callback returned {v:?}");
        }
        match deserialized {
            Ok(CallbackResponse::User { username, display_name, email, user_role, mut roles }) => {
                // Validate values
                let any_empty = username.is_empty() || display_name.is_empty()
                    || user_role.is_empty() || roles.contains("");
                if any_empty {
                    error!("Auth callback returned empty strings as user info");
                    return Err(callback_bad_gateway());
                }
                if !ctx.config.auth.is_user_role(&user_role) {
                    error!("Auth callback returned a user role that does not start \
                        with the configured user role prefix.");
                    return Err(callback_bad_gateway());
                }

                roles.insert(user_role.clone());
                Ok(Some(Self { username, display_name, email, roles, user_role }))
            },
            Ok(CallbackResponse::NoUser) => Ok(None),
            Err(e) => {
                error!("Could not deserialize body from auth callback: {e}");
                Err(callback_bad_gateway())
            },
        }
    }

    /// Creates a new session for this user and persists it in the database.
    /// Should only be called if the auth mode is `LoginProxy`.
    pub(crate) async fn persist_new_session(&self, db: &Client) -> Result<SessionId, PgError> {
        let session_id = SessionId::new();

        // A collision is so unfathomably unlikely that we don't check for it
        // here. We just pass the error up and respond with 500. Note that
        // Postgres will always error in case of collision, so security is
        // never compromised.
        let roles = self.roles.iter().collect::<Vec<_>>();
        db.execute_raw(
            "insert into \
                user_sessions (id, username, display_name, roles, email) \
                values ($1, $2, $3, $4, $5)",
            dbargs![&session_id, &self.username, &self.display_name, &roles, &self.email],
        ).await?;

        Ok(session_id)
    }

    /// Makes sure this user has the roles `ROLE_ANONYMOUS` and `ROLE_USER`.
    fn add_default_roles(&mut self) {
        // The conditionals are to prevent heap allocations when unneceesary.
        if !self.roles.contains(ROLE_ANONYMOUS) {
            self.roles.insert(ROLE_ANONYMOUS.into());
        }
        if !self.roles.contains(ROLE_USER) {
            self.roles.insert(ROLE_USER.into());
        }
    }
}


/// A marker type that serves to prove *some* user authorization has been done.
///
/// The goal of this is to prevent devs from forgetting to do authorization at
/// all. Since the token does not contain any information about what was
/// authorized, it cannot protect against anything else.
///
/// Has a private field so it cannot be created outside of this module.
pub(crate) struct AuthToken(());

impl AuthToken {
    fn some_if(v: bool) -> Option<Self> {
        if v { Some(Self(())) } else { None }
    }
}

// Our base64 decoding with the URL safe character set.
fn base64decode(input: impl AsRef<[u8]>) -> Result<Vec<u8>, base64::DecodeError> {
    base64::engine::general_purpose::URL_SAFE.decode(input)
}

fn base64encode(input: impl AsRef<[u8]>) -> String {
    base64::engine::general_purpose::URL_SAFE.encode(input)
}

pub(crate) trait HasRoles {
    /// Returns the role of the user.
    fn roles(&self) -> &HashSet<String>;

    /// Returns the role as `Vec` instead of `HashSet`, purely for convenience
    /// of passing it as SQL parameter.
    fn roles_vec(&self) -> Vec<&str> {
        self.roles().iter().map(|s| &**s).collect()
    }

    /// Returns an auth token IF this user is a Tobira admin (as determined
    /// by `RoleConfig::tobira_admin`).
    fn require_tobira_admin(&self, auth_config: &AuthConfig) -> Option<AuthToken> {
        AuthToken::some_if(self.is_tobira_admin(auth_config))
    }

    fn is_tobira_admin(&self, auth_config: &AuthConfig) -> bool {
        self.is_admin() || self.roles().contains(&auth_config.roles.tobira_admin)
    }

    fn can_upload(&self, auth_config: &AuthConfig) -> bool {
        self.is_tobira_admin(auth_config) || self.roles().contains(&auth_config.roles.upload)
    }

    fn can_use_studio(&self, auth_config: &AuthConfig) -> bool {
        self.is_tobira_admin(auth_config) || self.roles().contains(&auth_config.roles.studio)
    }

    fn can_use_editor(&self, auth_config: &AuthConfig) -> bool {
        self.is_tobira_admin(auth_config) || self.roles().contains(&auth_config.roles.editor)
    }

    fn can_create_user_realm(&self, auth_config: &AuthConfig) -> bool {
        self.roles().contains(&auth_config.roles.user_realm)
    }

    fn can_find_unlisted_items(&self, auth_config: &AuthConfig) -> bool {
        self.is_tobira_admin(auth_config)
            || self.roles().contains(&auth_config.roles.can_find_unlisted)
    }

    fn is_global_page_admin(&self, auth_config: &AuthConfig) -> bool {
        self.is_tobira_admin(auth_config)
            || self.roles().contains(&auth_config.roles.global_page_admin)
    }

    fn is_global_page_moderator(&self, auth_config: &AuthConfig) -> bool {
        self.is_global_page_admin(auth_config)
            || self.roles().contains(&auth_config.roles.global_page_moderator)
    }

    /// Returns `true` if the user is a global Opencast administrator and can do
    /// anything.
    fn is_admin(&self) -> bool {
        self.roles().contains(ROLE_ADMIN)
    }

    fn overlaps_roles<I, T>(&self, acls: I) -> bool
    where
        I: IntoIterator<Item = T>,
        T: AsRef<str>,
    {
        self.is_admin() || acls.into_iter().any(|role| self.roles().contains(role.as_ref()))
    }
}

impl HasRoles for User {
    fn roles(&self) -> &HashSet<String> {
        &self.roles
    }
}

impl HasRoles for AuthContext {
    fn roles(&self) -> &HashSet<String> {
        static TRUSTED_ROLES: Lazy<HashSet<String>>
            = Lazy::new(|| HashSet::from([ROLE_ADMIN.into()]));
        static ANONYMOUS_ROLES: Lazy<HashSet<String>>
            = Lazy::new(|| HashSet::from([ROLE_ANONYMOUS.into()]));

        match self {
            Self::Anonymous => &*ANONYMOUS_ROLES,
            Self::User(user) => user.roles(),
            // Note: We would like the trusted user to be rather restricted,
            // but as it's currently implemented, it needs at least moderator rights
            // to be able to use the `mount`-API.
            // For simplicity's sake we just make them admin here, but this will
            // likely change in the future. There are no guarantees being made, here!
            Self::TrustedExternal => &*TRUSTED_ROLES,
        }
    }
}

/// Long running task to perform various DB maintenance.
pub(crate) async fn db_maintenance(db: &Client, config: &AuthConfig) -> ! {
    /// Delete outdated user sessions every hour. Note that the session
    /// expiration time is still checked whenever the session is validated. So
    /// this duration is not about correctness, just about how often to clean
    /// up.
    const RUN_PERIOD: Duration = Duration::from_secs(60 * 60);

    loop {
        // Remove outdated user sessions.
        let sql = "delete from user_sessions \
            where extract(epoch from now() - created) > $1::double precision";
        match db.execute(sql, &[&config.session.duration.as_secs_f64()]).await {
            Err(e) => error!("Error deleting outdated user sessions: {}", e),
            Ok(0) => debug!("No outdated user sessions found in DB"),
            Ok(num) => info!("Deleted {num} outdated user sessions from DB"),
        }

        tokio::time::sleep(RUN_PERIOD).await;
    }
}

pub(crate) fn callback_bad_gateway() -> Response {
    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .body("Bad gateway: broken auth callback".into())
        .unwrap()
}
