use std::{borrow::Cow, time::Duration, collections::HashSet};

use base64::Engine;
use deadpool_postgres::Client;
use hyper::{HeaderMap, StatusCode};
use once_cell::sync::Lazy;
use secrecy::ExposeSecret;
use serde::Deserialize;
use tokio_postgres::Error as PgError;

use crate::{prelude::*, db::util::select, http::{Response, response, Request}};


mod cache;
mod config;
mod handlers;
mod session_id;
mod jwt;

pub(crate) use self::{
    cache::UserCache,
    config::{AuthConfig, AuthMode},
    session_id::SessionId,
    jwt::{JwtConfig, JwtContext},
    handlers::{handle_post_session, handle_delete_session, handle_post_login},
};


/// Users with this role can do anything as they are the global Opencast
/// administrator.
pub(crate) const ROLE_ADMIN: &str = "ROLE_ADMIN";

const ROLE_ANONYMOUS: &str = "ROLE_ANONYMOUS";

const SESSION_COOKIE: &str = "tobira-session";



/// Information about whether or not, and if so how
/// someone or something talking to Tobira is authenticated
#[derive(PartialEq, Eq)]
pub(crate) enum AuthContext {
    Anonymous,
    TrustedExternal,
    User(User),
}

/// Data about a user.
#[derive(Debug, PartialEq, Eq)]
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
        auth_config: &AuthConfig,
        db: &Client,
        user_cache: &UserCache,
    ) -> Result<Self, Response> {

        if let Some(given_key) = headers.get("x-tobira-trusted-external-key") {
            if let Some(trusted_key) = &auth_config.trusted_external_key {
                if trusted_key.expose_secret() == given_key {
                    return Ok(Self::TrustedExternal);
                }
            }
        }

        User::new(headers, auth_config, db, user_cache)
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
}

impl User {
    /// Obtains the current user from the given request headers. This is done
    /// either via auth headers and/or a session cookie, depending on the
    /// configuration. The `users` table is updated if appropriate.
    pub(crate) async fn new(
        headers: &HeaderMap,
        auth_config: &AuthConfig,
        db: &Client,
        user_cache: &UserCache,
    ) -> Result<Option<Self>, Response> {
        let out = match auth_config.mode {
            AuthMode::None => None,
            AuthMode::FullAuthProxy => Self::from_auth_headers(headers, auth_config),
            AuthMode::AuthCallback => {
                Self::from_callback_with_headers(headers, auth_config).await?
            }
            AuthMode::LoginProxy | AuthMode::Opencast | AuthMode::LoginCallback => {
                Self::from_session(headers, db, auth_config).await?
            }
        };

        if let Some(user) = &out {
            user_cache.upsert_user_info(user, db).await;
        }


        Ok(out)
    }

    /// Tries to read user data auth headers (`x-tobira-username`, ...). If the
    /// username or display name are not defined, returns `None`.
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
        let username = get_header(&auth_config.username_header)?;
        let display_name = get_header(&auth_config.display_name_header)?;
        let email = get_header(&auth_config.email_header);

        // Get roles from the user.
        let mut roles = HashSet::from([ROLE_ANONYMOUS.to_string()]);
        let roles_raw = get_header(&auth_config.roles_header)?;
        roles.extend(roles_raw.split(',').map(|role| role.trim().to_owned()));
        let user_role = auth_config
            .find_user_role(&username, roles.iter().map(|s| s.as_str()))?
            .to_owned();

        Some(Self { username, display_name, email, roles, user_role })
    }

    /// Tries to load user data from a DB session referred to in a session
    /// cookie. Should only be called if the auth mode is `LoginProxy`.
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
        let session_duration = auth_config.session_duration.as_secs_f64();
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

    pub(crate) async fn from_callback_with_headers(
        headers: &HeaderMap,
        auth_config: &AuthConfig,
    ) -> Result<Option<Self>, Response> {
        let mut req = Request::new(hyper::Body::empty());
        *req.headers_mut() = headers.clone();
        *req.uri_mut() = auth_config.callback_url.clone().unwrap();

        Self::from_callback(req, auth_config).await
    }

    pub(crate) async fn from_callback(
        req: Request,
        auth_config: &AuthConfig,
    ) -> Result<Option<Self>, Response> {
        // Send request and download response.
        // TOOD: Only create client once!
        let client = hyper::Client::new();
        let response = client.request(req).await.map_err(|e| {
            // TODO: maybe limit how quickly that can be logged?
            error!("Error contacting auth callback: {e}");
            response::bad_gateway()
        })?;
        let (parts, body) = response.into_parts();
        let body = hyper::body::to_bytes(body).await.map_err(|e| {
            error!("Error downloading body from auth callback: {e}");
            response::bad_gateway()
        })?;


        if parts.status != StatusCode::OK {
            error!("Auth callback replied with {} (which is unexpected)", parts.status);
            return Err(response::bad_gateway())
        }

        #[derive(Deserialize)]
        #[serde(tag = "outcome", rename_all = "kebab-case")]
        enum CallbackResponse {
            // Duplicating `User` fields here as this defines a public API, that
            // has to stay stable.
            #[serde(rename_all = "camelCase")]
            User {
                username: String,
                display_name: String,
                email: Option<String>,
                roles: HashSet<String>,
            },
            NoUser,
            // TODO: maybe add "redirect"?
        }

        // Note: this will also fail if `body` is not valid UTF-8.
        match serde_json::from_slice::<CallbackResponse>(&body) {
            Ok(CallbackResponse::User { username, display_name, email, roles }) => {
                let user_role = auth_config
                    .find_user_role(&username, roles.iter().map(|s| s.as_str()))
                    .expect("user session without user role")
                    .to_owned();
                Ok(Some(Self { username, display_name, email, roles, user_role }))
            },
            Ok(CallbackResponse::NoUser) => Ok(None),
            Err(e) => {
                error!("Could not deserialize body from auth callback: {e}");
                Err(response::bad_gateway())
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

    /// Returns an auth token IF this user is a Tobira moderator (as determined
    /// by `config.moderator_role`).
    fn require_moderator(&self, auth_config: &AuthConfig) -> Option<AuthToken> {
        AuthToken::some_if(self.is_moderator(auth_config))
    }

    fn required_upload_permission(&self, auth_config: &AuthConfig) -> Option<AuthToken> {
        AuthToken::some_if(self.can_upload(auth_config))
    }

    fn required_studio_permission(&self, auth_config: &AuthConfig) -> Option<AuthToken> {
        AuthToken::some_if(self.can_use_studio(auth_config))
    }

    fn required_editor_permission(&self, auth_config: &AuthConfig) -> Option<AuthToken> {
        AuthToken::some_if(self.can_use_editor(auth_config))
    }

    fn is_moderator(&self, auth_config: &AuthConfig) -> bool {
        self.is_admin() || self.roles().contains(&auth_config.moderator_role)
    }

    fn can_upload(&self, auth_config: &AuthConfig) -> bool {
        self.is_moderator(auth_config) || self.roles().contains(&auth_config.upload_role)
    }

    fn can_use_studio(&self, auth_config: &AuthConfig) -> bool {
        self.is_moderator(auth_config) || self.roles().contains(&auth_config.studio_role)
    }

    fn can_use_editor(&self, auth_config: &AuthConfig) -> bool {
        self.is_moderator(auth_config) || self.roles().contains(&auth_config.editor_role)
    }

    fn can_create_user_realm(&self, auth_config: &AuthConfig) -> bool {
        self.roles().contains(&auth_config.user_realm_role)
    }

    /// Returns `true` if the user is a global Opencast administrator and can do
    /// anything.
    fn is_admin(&self) -> bool {
        self.roles().iter().any(|role| role == ROLE_ADMIN)
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
        match db.execute(sql, &[&config.session_duration.as_secs_f64()]).await {
            Err(e) => error!("Error deleting outdated user sessions: {}", e),
            Ok(0) => debug!("No outdated user sessions found in DB"),
            Ok(num) => info!("Deleted {num} outdated user sessions from DB"),
        }

        tokio::time::sleep(RUN_PERIOD).await;
    }
}
