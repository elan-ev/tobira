use std::time::Duration;

use hyper::Uri;
use isahc::http::HeaderName;
use secrecy::Secret;
use serde::{Deserialize, Deserializer, de::Error};
use url::Url;

use crate::{config::TranslatedString, prelude::*};

use super::JwtConfig;


/// Authentification and authorization
#[derive(Debug, Clone, confique::Config)]
pub(crate) struct AuthConfig {
    /// The mode of authentication. See the authentication docs for more information.
    #[config(default = "none")]
    pub(crate) mode: AuthMode,

    /// Link of the login button. If not set, the login button internally
    /// (not via `<a>`, but through JavaScript) links to Tobira's own login page.
    pub(crate) login_link: Option<String>,

    /// Link of the logout button. If not set, clicking the logout button will
    /// send a `DELETE` request to `/~session`.
    pub(crate) logout_link: Option<String>,

    /// Only for `*-callback` modes: URL to HTTP API to resolve incoming request
    /// to user information.
    #[config(deserialize_with = AuthConfig::deserialize_callback_url)]
    pub(crate) callback_url: Option<Uri>,

    #[config(nested)]
    pub(crate) callback: CallbackConfig,

    /// The header containing a unique and stable username of the current user.
    #[config(default = "x-tobira-username")]
    pub(crate) username_header: String,

    /// The header containing the human-readable name of the current user
    /// (e.g. "Peter Lustig").
    #[config(default = "x-tobira-user-display-name")]
    pub(crate) display_name_header: String,

    /// The header containing the email address of the current user.
    #[config(default = "x-tobira-user-email")]
    pub(crate) email_header: String,

    /// The header containing a comma-separated list of roles of the current user.
    #[config(default = "x-tobira-user-roles")]
    pub(crate) roles_header: String,

    /// If a user has this role, they are treated as a moderator in Tobira,
    /// giving them the ability to modify the realm structure among other
    /// things.
    #[config(default = "ROLE_TOBIRA_MODERATOR")]
    pub(crate) moderator_role: String,

    /// If a user has this role, they are allowed to use the Tobira video
    /// uploader to ingest videos to Opencast.
    #[config(default = "ROLE_TOBIRA_UPLOAD")]
    pub(crate) upload_role: String,

    /// If a user has this role, they are allowed to use Opencast Studio to
    /// record and upload videos.
    #[config(default = "ROLE_TOBIRA_STUDIO")]
    pub(crate) studio_role: String,

    /// If a user has this role, they are allowed to use the Opencast editor to
    /// edit videos they have write access to.
    #[config(default = "ROLE_TOBIRA_EDITOR")]
    pub(crate) editor_role: String,

    /// If a user has this role, they are allowed to create their own "user realm".
    #[config(default = "ROLE_USER")]
    pub(crate) user_realm_role: String,

    /// List of prefixes that user roles can have. Used to distinguish user
    /// roles from other roles. Should probably be the same as
    /// `role_user_prefix` in `acl.default.create.properties` in OC.
    #[config(default = ["ROLE_USER_"])]
    pub(crate) user_role_prefixes: Vec<String>,

    /// Duration of a Tobira-managed login session.
    /// Note: This is only relevant if `auth.mode` is `login-proxy`.
    #[config(default = "30d", deserialize_with = crate::config::deserialize_duration)]
    pub(crate) session_duration: Duration,

    /// A shared secret for **trusted** external applications.
    /// Send this value as the `x-tobira-trusted-external-key`-header
    /// to use certain APIs without having to invent a user.
    /// Note that this should be hard to guess, and kept secret.
    /// Specifically, you are going to want to encrypt every channel
    /// this is sent over.
    pub(crate) trusted_external_key: Option<Secret<String>>,

    /// Configuration related to the built-in login page.
    #[config(nested)]
    pub(crate) login_page: LoginPageConfig,

    /// JWT configuration. See documentation for more information.
    #[config(nested)]
    pub(crate) jwt: JwtConfig,

    /// Determines whether or not Tobira users are getting pre-authenticated against
    /// Opencast when they visit external links like the ones to Opencast Studio
    /// or the Editor. If you have an SSO-solution, you don't need this.
    #[config(default = false)]
    pub(crate) pre_auth_external_links: bool,
}

impl AuthConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        let cb_mode = matches!(self.mode, AuthMode::LoginCallback | AuthMode::AuthCallback);
        if cb_mode && !self.callback_url.is_some() {
            bail!(
                "'auth.mode' is '{}', which requires 'auth.callback_url' to be set, but it is not.",
                self.mode.label(),
            );
        }
        if !cb_mode && self.callback_url.is_some() {
            bail!(
                "'auth.mode' is '{}', but 'auth.callback_url' is specified, which makes no sense",
                self.mode.label(),
            );
        }

        match (self.mode == AuthMode::AuthCallback, self.callback.relevant_headers.is_some()) {
            (true, true) | (false, false) => {}
            (true, false) => bail!("'auth.mode' is 'auth-callback', which requires \
                'auth.callback_headers' to be set, but it is not."),
            (false, true) => bail!("'auth.callback_headers' is specified, but \
                'auth.mode' is not 'auth-callback', which makes no sense"),
        }

        Ok(())
    }

    pub(super) fn deserialize_callback_url<'de, D>(deserializer: D) -> Result<Uri, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        let url: Url = s.parse()
            .map_err(|e| <D::Error>::custom(format!("invalid URL: {e}")))?;
        if url.query().is_some() || url.fragment().is_some() {
            return Err(
                <D::Error>::custom("'auth.callback_url' must not contain a query or fragment part"),
            );
        }

        Uri::builder()
            .scheme(url.scheme())
            .authority(url.authority())
            .path_and_query(url.path())
            .build()
            .unwrap()
            .pipe(Ok)
    }

    pub(super) fn deserialize_callback_headers<'de, D>(
        deserializer: D,
    ) -> Result<Vec<HeaderName>, D::Error>
    where
        D: Deserializer<'de>,
    {
        <Vec<String>>::deserialize(deserializer)?
            .into_iter()
            .map(|s| {
                HeaderName::try_from(s)
                    .map_err(|e| <D::Error>::custom(format!("invalid header name: {e}")))
            })
            .collect::<Result<Vec<_>, _>>()?
            .pipe(Ok)
    }

    /// Finds the user role from the given roles according to
    /// `user_role_prefixes`. If none can be found, `None` is returned and a
    /// warning is printed. If more than one is found, a warning is printed and
    /// the first one is returned.
    pub(super) fn find_user_role<'a>(
        &self,
        username: &str,
        mut roles: impl Iterator<Item = &'a str>,
    ) -> Option<&'a str> {
        let is_user_role = |role: &&str| {
            self.user_role_prefixes.iter().any(|prefix| role.starts_with(prefix))
        };

        let note = "Check 'auth.user_role_prefixes' and your auth integration.";
        let Some(user_role) = roles.by_ref().find(is_user_role) else {
            warn!("User '{username}' has no user role, but it needs exactly one. {note}");
            return None;
        };


        if let Some(extra) = roles.find(is_user_role) {
            warn!(
                "User '{username}' has multiple user roles ({user_role} and {extra}) \
                    but there should be only one user role per user. {note}",
            );
        }

        Some(user_role)
    }
}


#[derive(Debug, Clone, confique::Config)]
pub(crate) struct LoginPageConfig {
    /// Label for the user-ID field. If not set, "User ID" is used.
    pub(crate) user_id_label: Option<TranslatedString>,

    /// Label for the password field. If not set, "Password" is used.
    pub(crate) password_label: Option<TranslatedString>,

    /// An additional note that is displayed on the login page. If not set, no
    /// additional note is shown.
    pub(crate) note: Option<TranslatedString>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum AuthMode {
    None,
    FullAuthProxy,
    LoginProxy,
    AuthCallback,
    LoginCallback,
    Opencast,
}


impl AuthMode {
    /// Returns the string that has to be specified in the config file to select
    /// this mode.
    pub fn label(&self) -> &'static str {
        match self {
            AuthMode::None => "none",
            AuthMode::FullAuthProxy => "full-auth-proxy",
            AuthMode::LoginProxy => "login-proxy",
            AuthMode::AuthCallback => "auth-callback",
            AuthMode::LoginCallback => "login-callback",
            AuthMode::Opencast => "opencast",
        }
    }
}

#[derive(Debug, Clone, confique::Config)]
pub(crate) struct CallbackConfig {
    /// Headers relevant for the auth callback. Only headers of the incoming
    /// request listed here are forwarded to the callback. Requests without any
    /// of these headers set are treated as unauthenticated.
    #[config(deserialize_with = AuthConfig::deserialize_callback_headers)]
    pub(crate) relevant_headers: Option<Vec<HeaderName>>,

    /// For how long a callback's response is cached. The key of the cache is
    /// the set of headers forwarded to the callback. Set to 0 to disable
    /// caching.
    #[config(default = "5min", deserialize_with = crate::config::deserialize_duration)]
    pub(crate) cache_duration: Duration,
}
