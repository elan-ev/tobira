

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
    pub(crate) display_roles: String,

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

