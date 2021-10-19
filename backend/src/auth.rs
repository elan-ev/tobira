use std::borrow::Cow;

use hyper::HeaderMap;
use once_cell::sync::Lazy;

use crate::prelude::*;


/// Users with this role can do anything as they are the global Opencast
/// administrator.
const ROLE_ADMIN: &str = "ROLE_ADMIN";

const ROLE_ANONYMOUS: &str = "ROLE_ANONYMOUS";


/// Authentification and authorization
#[derive(Debug, confique::Config)]
pub(crate) struct AuthConfig {
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

    #[config(nested)]
    pub(crate) proxy: AuthProxyConfig,
}

/// Authentication proxy configuration.
#[derive(Debug, confique::Config)]
pub(crate) struct AuthProxyConfig {
    /// TODO
    #[config(default = false)]
    pub(crate) enabled: bool,
}


/// An optional user.
#[derive(Debug)]
pub(crate) enum UserSession {
    None,
    User {
        username: String,
        display_name: String,
        roles: Vec<String>,
    },
}

impl UserSession {
    pub(crate) fn from_headers(headers: &HeaderMap, auth_config: &AuthConfig) -> Self {
        // Helper function to read and base64 decode a header value.
        let get_header = |header_name: &str| -> Option<String> {
            let value = headers.get(header_name)?;
            let decoded = base64::decode_config(value.as_bytes(), base64::URL_SAFE)
                .map_err(|e| warn!("header '{}' is set but not valid base64: {}", header_name, e))
                .ok()?;

            String::from_utf8(decoded)
                .map_err(|e| warn!("header '{}' is set but decoded base64 is not UTF8: {}", header_name, e))
                .ok()
        };


        // We only read these header values if the auth proxy is enabled.
        if !auth_config.proxy.enabled {
            return Self::None;
        }

        // Get required headers. If these are not set and valid, we treat it as
        // if there is no user session.
        let username = match get_header(&auth_config.username_header) {
            Some(v) => v,
            None => return Self::None,
        };
        let display_name = match get_header(&auth_config.display_name_header) {
            Some(v) => v,
            None => return Self::None,
        };


        // Get roles from the user. If the header is not set, the user simply has no extra roles.
        let mut roles = vec![ROLE_ANONYMOUS.to_string()];
        if let Some(roles_raw) = get_header(&auth_config.roles_header) {
            roles.extend(roles_raw.split(',').map(|role| role.trim().to_owned()));
        };

        Self::User { username, display_name, roles }
    }

    /// Returns a representation of the optional username useful for logging.
    pub(crate) fn debug_log_username(&self) -> Cow<'static, str> {
        match self {
            Self::None => "none".into(),
            Self::User { username, .. } => format!("'{}'", username).into(),
        }
    }

    /// Returns the roles of the user if logged in, and `ROLE_ANONYMOUS` otherwise.
    pub(crate) fn roles(&self) -> &[String] {
        static LOGGED_OUT_ROLES: Lazy<[String; 1]> = Lazy::new(|| [ROLE_ANONYMOUS.into()]);

        match self {
            Self::None => &*LOGGED_OUT_ROLES,
            Self::User { roles, .. } => roles,
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
