use std::borrow::Cow;

use deadpool_postgres::Client;
use hyper::HeaderMap;
use once_cell::sync::Lazy;
use tokio_postgres::Error as PgError;

use crate::prelude::*;


mod handlers;
mod session_id;

pub(crate) use self::{
    session_id::SessionId,
    handlers::{handle_login, handle_logout},
};


/// Users with this role can do anything as they are the global Opencast
/// administrator.
const ROLE_ADMIN: &str = "ROLE_ADMIN";

const ROLE_ANONYMOUS: &str = "ROLE_ANONYMOUS";

const SESSION_COOKIE: &str = "tobira-session";


/// Authentification and authorization
#[derive(Debug, confique::Config)]
pub(crate) struct AuthConfig {
    /// The mode of authentication. Compare the authentication docs! Possible values:
    ///
    /// - 'full-auth-proxy': Tobira does no session handling and expects an auth
    ///   proxy in front of every route, passing user info via auth headers.
    /// - 'login-proxy': Tobira does its own session handling and expects the auth
    ///    system to send `POST /~session` with auth headers to create a session.
    ///
    /// **Important**: in either case, you HAVE to make sure to remove all auth
    /// headers from incoming user requests before passing them on to Tobira!
    mode: AuthMode,

    /// Link of the login button. If not set, the login button internally
    /// (not via `<a>`, but through JavaScript) links to Tobira's own login page.
    pub(crate) login_link: Option<String>,

    /// The header containing a unique and stable username of the current user.
    /// TODO: describe properties, requirements and usages of username.
    #[config(default = "x-tobira-username")]
    pub(crate) username_header: String,

    /// The header containing the human-readable name of the current user
    /// (e.g. "Peter Lustig").
    #[config(default = "x-tobira-user-display-name")]
    pub(crate) display_name_header: String,

    /// The header containing a comma-separated list of roles of the current user.
    #[config(default = "x-tobira-user-roles")]
    pub(crate) roles_header: String,

    /// If a user has this role, they are treated as a moderator in Tobira,
    /// giving them the ability to modify the realm structure among other
    /// things.
    #[config(default = "ROLE_TOBIRA_MODERATOR")]
    pub(crate) moderator_role: String,

    /// Configuration related to the built-in login page.
    #[config(nested)]
    pub(crate) login_page: LoginPageConfig,
}

/// Authentification and authorization
#[derive(Debug, confique::Config)]
pub(crate) struct LoginPageConfig {
    /// Label for the user-ID field. If not set, "User ID" is used.
    pub(crate) user_id_label: Option<String>,

    /// Label for the password field. If not set, "Password" is used.
    pub(crate) password_label: Option<String>,

    /// An additional note that is displayed on the login page. If not set, no
    /// additional note is shown.
    pub(crate) note: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum AuthMode {
    FullAuthProxy,
    LoginProxy,
}

/// An optional user session.
#[derive(Debug)]
pub(crate) enum User {
    None,
    Some(UserData),
}

/// Data about a user.
#[derive(Debug)]
pub(crate) struct UserData {
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) roles: Vec<String>,
}

impl User {
    /// Obtains the current user from the given request headers. This is done
    /// either via auth headers and/or a session cookie, depending on the
    /// configuration.
    pub(crate) async fn new(
        headers: &HeaderMap,
        auth_config: &AuthConfig,
        db: &Client,
    ) -> Result<Self, PgError> {
        match auth_config.mode {
            AuthMode::FullAuthProxy => Ok(UserData::from_auth_headers(headers, auth_config).into()),
            AuthMode::LoginProxy => UserData::from_session(headers, db).await.map(Into::into),
        }
    }

    /// Returns a representation of the optional username useful for logging.
    pub(crate) fn debug_log_username(&self) -> Cow<'static, str> {
        match self {
            Self::None => "none".into(),
            Self::Some(user) => format!("'{}'", user.username).into(),
        }
    }

    /// Returns the roles of the user if logged in, and `ROLE_ANONYMOUS` otherwise.
    pub(crate) fn roles(&self) -> &[String] {
        static LOGGED_OUT_ROLES: Lazy<[String; 1]> = Lazy::new(|| [ROLE_ANONYMOUS.into()]);

        match self {
            Self::None => &*LOGGED_OUT_ROLES,
            Self::Some(user) => &user.roles,
        }
    }

    /// Returns an auth token IF this user is a Tobira moderator (as determined
    /// by `config.moderator_role`).
    pub(crate) fn require_moderator(&self, auth_config: &AuthConfig) -> Option<AuthToken> {
        AuthToken::some_if(self.is_moderator(auth_config))
    }

    pub(crate) fn is_moderator(&self, auth_config: &AuthConfig) -> bool {
        self.is_admin() || self.roles().contains(&auth_config.moderator_role)
    }

    /// Returns `true` if the user is a global Opencast administrator and can do
    /// anything.
    pub(crate) fn is_admin(&self) -> bool {
        self.roles().iter().any(|role| role == ROLE_ADMIN)
    }
}

impl From<Option<UserData>> for User {
    fn from(src: Option<UserData>) -> Self {
        match src {
            Some(data) => Self::Some(data),
            None => Self::None,
        }
    }
}

impl UserData {
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

        // Get roles from the user. If the header is not set, the user simply has no extra roles.
        let mut roles = vec![ROLE_ANONYMOUS.to_string()];
        if let Some(roles_raw) = get_header(&auth_config.roles_header) {
            roles.extend(roles_raw.split(',').map(|role| role.trim().to_owned()));
        };

        Some(Self { username, display_name, roles })
    }

    /// Tries to load user data from a DB session referred to in a session
    /// cookie. Should only be called if the auth mode is `LoginProxy`.
    async fn from_session(headers: &HeaderMap, db: &Client) -> Result<Option<Self>, PgError> {
        // Try to get a session ID from the cookie.
        let session_id = match SessionId::from_headers(headers) {
            None => return Ok(None),
            Some(id) => id,
        };

        // Check if such a session exists in the DB.
        let sql = "update user_sessions \
            set last_used = now() \
            where id = $1\
            returning username, display_name, roles";
        let row = match db.query_opt(sql, &[&session_id]).await? {
            None => return Ok(None),
            Some(row) => row,
        };

        Ok(Some(Self {
            username: row.get(0),
            display_name: row.get(1),
            roles: row.get(2),
        }))
    }

    /// Creates a new session for this user and persists it in the database.
    /// Should only be called if the auth mode is `LoginProxy`.
    pub(crate) async fn persist_new_session(&self, db: &Client) -> Result<SessionId, PgError> {
        let session_id = SessionId::new();

        // A collision is so unfathomably unlikely that we don't check for it
        // here. We just pass the error up and respond with 500. Note that
        // Postgres will always error in case of collision, so security is
        // never compromised.
        db.execute_raw(
            "insert into \
                user_sessions (id, username, display_name, roles) \
                values ($1, $2, $3, $4)",
            dbargs![&session_id, &self.username, &self.display_name, &self.roles],
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
    base64::decode_config(input, base64::URL_SAFE)
}

fn base64encode(input: impl AsRef<[u8]>) -> String {
    base64::encode_config(input, base64::URL_SAFE)
}
