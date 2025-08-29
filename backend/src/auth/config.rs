use std::time::Duration;

use hyper::{http::HeaderName, Uri};
use secrecy::SecretString;
use serde::{Deserialize, Deserializer, de::Error};

use crate::{config::parse_normal_http_uri, model::TranslatedString, prelude::*};

use super::JwtConfig;


/// Authentification and authorization
#[derive(Debug, Clone, confique::Config)]
#[config(validate = Self::validate)]
pub(crate) struct AuthConfig {
    /// How incoming HTTP requests are authenticated. See the documentation!
    #[config(default = "none")]
    pub(crate) source: AuthSource,

    /// Whether to hide the login button in the header. Useful when only admins
    /// are supposed to log into Tobira by visiting the login page directly.
    #[config(default = false)]
    pub(crate) hide_login_button: bool,

    /// Link of the login button. If not set, the login button internally
    /// (not via `<a>`, but through JavaScript) links to Tobira's own login page.
    pub(crate) login_link: Option<String>,

    /// Link of the logout button.
    pub(crate) logout_link: Option<String>,

    /// A shared secret for **trusted** external applications. Send this value
    /// as the `x-tobira-trusted-external-key`-header to use certain APIs
    /// without having to invent a user. Note that this should be hard to
    /// guess, and kept secret. Specifically, you are going to want to encrypt
    /// every channel this is sent over.
    pub(crate) trusted_external_key: Option<SecretString>,

    /// Determines whether or not Tobira users are getting pre-authenticated against
    /// Opencast when they visit external links like the ones to Opencast Studio
    /// or the Editor. If you have an SSO-solution, you don't need this.
    #[config(default = false)]
    pub(crate) pre_auth_external_links: bool,

    /// Tobira's built-in session management. Only relevant if `auth.source = "tobira-session"`.
    #[config(nested)]
    pub(crate) session: SessionConfig,

    #[config(nested)]
    pub(crate) callback: CallbackConfig,

    /// Configuration related to the built-in login page.
    #[config(nested)]
    pub(crate) login_page: LoginPageConfig,

    /// JWT configuration. See documentation for more information.
    #[config(nested)]
    pub(crate) jwt: JwtConfig,

    #[config(nested)]
    pub(crate) roles: RoleConfig,
}

impl AuthConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.login_link.is_some() && (self.login_page.user_id_label.is_some()
            || self.login_page.password_label.is_some()
            || self.login_page.note.is_some())
        {
            bail!("'auth.login_link' is set, but so are some 'auth.login_page.*' values. \
                That makes no sense.");
        }

        if self.logout_link.is_none()
            && matches!(self.source, AuthSource::Callback(_) | AuthSource::TrustAuthHeaders)
        {
            bail!("'auth.logout_link' is not set, but 'auth.source' is '{}'. That \
                would mean the logout button does nothing. You have to set a logout link.",
                self.source.label(),
            )
        }

        let relevant_headers_or_cookies = self.callback.relevant_headers.is_some()
            || self.callback.relevant_cookies.is_some();
        let auth_callback_used = matches!(self.source, AuthSource::Callback(_))
            || matches!(self.session.from_session_endpoint, SessionEndpointHandler::Callback(_));
        match (auth_callback_used, relevant_headers_or_cookies) {
            (true, false) => bail!("'auth.source' is 'callback', which means 'relevant_headers' \
                and/or 'relevant_cookies' need to be set, but they are not."),
            (false, true) => bail!("'auth.source' is not 'callback', but 'relevant_headers' \
                and/or 'relevant_cookies' is set, which makes no sense."),
            _ => {}
        }

        let cookie_header_relevant = self.callback.relevant_headers
            .as_ref()
            .is_some_and(|v| v.contains(&HeaderName::from_static("cookie")));
        if cookie_header_relevant && self.callback.relevant_cookies.is_some() {
            bail!("'auth.callback.relevant_headers' contains 'Cookie', so the full \
                cookie header is always included, and thus it makes no sense to set \
                'auth.callback.relevant_cookies'. But it is set.");
        }

        let session_sources_defined = false
            || self.session.from_login_credentials != LoginCredentialsHandler::None
            || self.session.from_session_endpoint != SessionEndpointHandler::None;
        if self.source == AuthSource::TobiraSession {
            if !session_sources_defined {
                bail!("'auth.source' is 'tobira-session', but no way to create \
                    sessions is configured: set 'auth.session.from_login_credentials' \
                    or 'auth.session.from_session_endpoint'");
            }
        } else {
            if session_sources_defined {
                bail!("'auth.source' is not 'tobira-session', but \
                    'auth.session.from_login_credentials' or \
                    'auth.session.from_session_endpoint' is set.");
            }
        }

        Ok(())
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
        let is_user_role = |role: &&str| self.is_user_role(*role);

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

    pub(crate) fn is_user_role(&self, role: &str) -> bool {
        self.roles.user_role_prefixes.iter().any(|prefix| role.starts_with(prefix))
    }
}

#[derive(Debug, Clone, confique::Config)]
pub(crate) struct SessionConfig {
    /// How to create sessions from login credentials (userid + password).
    #[config(default = "none")]
    pub(crate) from_login_credentials: LoginCredentialsHandler,

    /// How `POST /~session` requests are authenticated.
    #[config(default = "none")]
    pub(crate) from_session_endpoint: SessionEndpointHandler,

    /// Duration of a Tobira-managed login session.
    #[config(default = "30d", deserialize_with = crate::config::deserialize_duration)]
    pub(crate) duration: Duration,
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


#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(try_from = "String")]
pub(crate) enum AuthSource {
    None,
    TobiraSession,
    Callback(CallbackUri),
    TrustAuthHeaders,
}

impl TryFrom<String> for AuthSource {
    type Error = anyhow::Error;

    fn try_from(value: String) -> std::result::Result<Self, Self::Error> {
        if value == "none" {
            Ok(Self::None)
        } else if value == "trust-auth-headers" {
            Ok(Self::TrustAuthHeaders)
        } else if value == "tobira-session" {
            Ok(Self::TobiraSession)
        } else if let Some(url) = value.strip_prefix("callback:") {
            Ok(Self::Callback(CallbackUri::parse(url)?))
        } else {
            Err(anyhow!("invalid value, check docs for possible options"))
        }
    }
}

impl AuthSource {
    pub(crate) fn label(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::TobiraSession => "tobira-session",
            Self::Callback(_) => "callback",
            Self::TrustAuthHeaders => "trust-auth-headers",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(try_from = "String")]
pub(crate) enum LoginCredentialsHandler {
    None,
    Opencast,
    Callback(CallbackUri),
}

impl TryFrom<String> for LoginCredentialsHandler {
    type Error = anyhow::Error;

    fn try_from(value: String) -> std::result::Result<Self, Self::Error> {
        if value == "none" {
            Ok(Self::None)
        } else if value == "opencast" {
            Ok(Self::Opencast)
        } else if let Some(url) = value.strip_prefix("login-callback:") {
            Ok(Self::Callback(CallbackUri::parse(url)?))
        } else {
            Err(anyhow!("invalid value, check docs for possible options"))
        }
    }
}

impl LoginCredentialsHandler {
    pub(crate) fn label(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Callback(_) => "login-callback",
            Self::Opencast => "opencast",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(try_from = "String")]
pub(crate) enum SessionEndpointHandler {
    None,
    Callback(CallbackUri),
    TrustAuthHeaders,
}

impl TryFrom<String> for SessionEndpointHandler {
    type Error = anyhow::Error;

    fn try_from(value: String) -> std::result::Result<Self, Self::Error> {
        if value == "none" {
            Ok(Self::None)
        } else if value == "trust-auth-headers" {
            Ok(Self::TrustAuthHeaders)
        } else if let Some(url) = value.strip_prefix("callback:") {
            Ok(Self::Callback(CallbackUri::parse(url)?))
        } else {
            Err(anyhow!("invalid value, check docs for possible options"))
        }
    }
}

impl SessionEndpointHandler {
    pub(crate) fn label(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Callback(_) => "login-callback",
            Self::TrustAuthHeaders => "trust-auth-headers",
        }
    }
}

#[derive(Debug, Clone, confique::Config)]
pub(crate) struct CallbackConfig {
    /// Headers relevant for the auth callback. See docs.
    #[config(deserialize_with = deserialize_callback_headers)]
    pub(crate) relevant_headers: Option<Vec<HeaderName>>,

    /// Cookies relevant for the auth callback. See docs.
    pub(crate) relevant_cookies: Option<Vec<String>>,

    /// For how long a callback's response is cached. The key of the cache is
    /// the set of headers forwarded to the callback. Set to 0 to disable
    /// caching.
    #[config(default = "5min", deserialize_with = CallbackCacheDuration::deserialize)]
    pub(crate) cache_duration: CallbackCacheDuration,
}

#[derive(Debug, Clone)]
pub(crate) enum CallbackCacheDuration {
    Disabled,
    Enabled(Duration),
}

impl CallbackCacheDuration {
    fn deserialize<'de, D>(deserializer: D) -> Result<Self, D::Error>
        where D: serde::Deserializer<'de>,
    {
        let duration = crate::config::deserialize_duration(deserializer)?;
        if duration.is_zero() {
            Ok(Self::Disabled)
        } else {
            Ok(Self::Enabled(duration))
        }
    }
}

#[derive(Debug, Clone, confique::Config)]
pub(crate) struct RoleConfig {
    /// The role giving a user "Tobira admin" status, giving them all
    /// Tobira-related privileges, i.e. everything for which a role can be
    /// configured below. Unlike ROLE_ADMIN, this does not give the user access
    /// to all content.
    #[config(default = "ROLE_TOBIRA_ADMIN")]
    pub(crate) tobira_admin: String,

    /// The role granting permission to use Tobira's uploader.
    #[config(default = "ROLE_TOBIRA_UPLOAD")]
    pub(crate) upload: String,

    /// The role granting permission to create new series through Tobira.
    #[config(default = "ROLE_TOBIRA_CAN_CREATE_SERIES")]
    pub(crate) can_create_series: String,

    /// The role granting permission to use Opencast Studio from Tobira.
    #[config(default = "ROLE_TOBIRA_STUDIO")]
    pub(crate) studio: String,

    /// The role granting permission to use the Opencast Editor from Tobira.
    #[config(default = "ROLE_TOBIRA_EDITOR")]
    pub(crate) editor: String,

    /// The role granting permission to create one's own "user page".
    #[config(default = "ROLE_USER")]
    pub(crate) user_realm: String,

    /// The role granting permission to find unlisted events and series when
    /// editing page content. Usually, only very few people should have this
    /// privilege. Everyone can always find listed items and items they have
    /// write access to. This does not affect the search results of the main
    /// search.
    #[config(default = "ROLE_TOBIRA_CAN_FIND_UNLISTED")]
    pub(crate) can_find_unlisted: String,

    /// The role granting "page admin" privileges on all non-user pages.
    #[config(default = "ROLE_TOBIRA_GLOBAL_PAGE_ADMIN")]
    pub(crate) global_page_admin: String,

    /// The role granting "page moderator" privileges on all non-user pages.
    #[config(default = "ROLE_TOBIRA_GLOBAL_PAGE_MODERATOR")]
    pub(crate) global_page_moderator: String,

    /// List of prefixes that user roles can have. Used to distinguish user
    /// roles from other roles. Should probably be the same as
    /// `role_user_prefix` in `acl.default.create.properties` in OC.
    #[config(default = ["ROLE_USER_"])]
    pub(crate) user_role_prefixes: Vec<String>,

    /// List of tenant specific admin roles that have the same permission level
    /// as ROLE_ADMIN for that tenant.
    #[config(default = "ROLE_TENANT_ADMIN")]
    pub(crate) tenant_admin: String,
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

#[derive(Debug, Clone, PartialEq, Eq,)]
pub(crate) enum CallbackUri {
    Tcp(Uri),
    Uds(Uri),
}

impl CallbackUri {
    fn parse(s: &str) -> Result<Self> {
        if s.starts_with("http://") || s.starts_with("https://") {
            Ok(Self::Tcp(parse_normal_http_uri(s)?))
        } else if let Some(s) = s.strip_prefix("http+unix://") {
            let msg = "UDS urls must use syntax 'http+unix://[/path/to/socket.sock]/foo/bar'";
            anyhow::ensure!(s.as_bytes()[0] == b'[', msg);
            let end_authority = s.find("]/").ok_or_else(|| anyhow!(msg))?;
            let fs_path = &s[1..end_authority];
            let http_path = &s[end_authority + 2..];
            anyhow::ensure!(!http_path.contains('?'), "query part not allowed in callback URI");
            anyhow::ensure!(!http_path.contains('#'), "fragment not allowed in callback URI");
            Ok(Self::Uds(hyperlocal::Uri::new(fs_path, http_path).into()))
        } else {
            bail!("callback URI has to start with one of 'http://', 'https://' or 'http+unix://'");
        }
    }

    pub(crate) fn uri(&self) -> &Uri {
        match self {
            CallbackUri::Tcp(uri) => uri,
            CallbackUri::Uds(uri) => uri,
        }
    }
}
