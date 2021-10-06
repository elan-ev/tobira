use hyper::{HeaderMap, header::HeaderValue};
use juniper::GraphQLObject;


/// Users with this role can do anything as they are the global Opencast
/// administrator.
const ADMIN_ROLE: &str = "ROLE_ADMIN";


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


/// Data about a logged-in user.
#[derive(Debug, GraphQLObject)]
pub(crate) struct User {
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) roles: Vec<String>,
}

impl User {
    pub(crate) fn from_headers(headers: &HeaderMap, auth_config: &AuthConfig) -> Option<Self> {
        // We only read these header values if the auth proxy is enabled.
        if !auth_config.proxy.enabled {
            return None;
        }

        let as_utf8 = |v: &HeaderValue| String::from_utf8_lossy(v.as_bytes()).trim().to_owned();
        let username = as_utf8(headers.get(&auth_config.username_header)?);
        let display_name = as_utf8(headers.get(&auth_config.display_name_header)?);

        let roles = match headers.get(&auth_config.roles_header) {
            None => vec![],
            Some(roles_raw) => {
                String::from_utf8_lossy(roles_raw.as_bytes())
                    .split(',')
                    .map(|role| role.trim().to_owned())
                    .collect()
            },
        };

        Some(Self { username, display_name, roles })
    }

    /// Returns an auth token IF this user is a Tobira moderator (as determined
    /// by `config.moderator_role`).
    pub(crate) fn require_moderator(&self, auth_config: &AuthConfig) -> Option<AuthToken> {
        if self.is_admin() || self.roles.contains(&auth_config.moderator_role) {
            Some(AuthToken(()))
        } else {
            None
        }
    }

    /// Returns `true` if the user is a global Opencast administrator and can do
    /// anything.
    pub(crate) fn is_admin(&self) -> bool {
        self.roles.iter().any(|role| role == ADMIN_ROLE)
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
