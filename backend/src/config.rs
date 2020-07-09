use anyhow::{bail, Context, Result};
use log::{debug, info};
use serde::Deserialize;
use std::{
    fs,
    net::{IpAddr, Ipv4Addr},
    path::Path,
};


/// Configuration root.
///
/// This is automatically deserialized from a TOML file.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Config {
    pub http: Http,
    pub db: Db,
}

impl Config {
    /// Tries to find a config file from a list of possible default config file
    /// locations. The first config file is loaded via [`Self::load_from`].
    pub fn from_default_locations() -> Result<Self> {
        // TODO: there should be more useful default locations. This is OS
        // dependent.
        let default_locations = ["config.toml"];

        if let Some(path) = default_locations.iter().map(Path::new).find(|p| p.exists()) {
            Self::load_from(path)
        } else {
            if cfg!(debug_assertions) {
                Ok(Self::default())
            } else {
                bail!(
                    "no configuration file found (note: this is a production build and \
                        thus, a configuration file is required). Hint: we checked the \
                        following paths: {}",
                    default_locations.join(", "),
                );
            }
        }
    }

    /// Loads the configuration from a specific TOML file.
    pub fn load_from(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        info!("Loading configuration from '{}'", path.display());

        let file = fs::read_to_string(path)
            .context(format!("failed to open '{}' as configuration file", path.display()))?;
        let out: Self = toml::from_str(&file)
            .context(format!("failed to deserialize '{}' as Config", path.display()))?;

        out.validate()?;

        Ok(out)
    }

    /// Performs some validation of the configuration to find some illegal or
    /// conflicting values.
    fn validate(&self) -> Result<()> {
        debug!("Validating configuration...");

        macro_rules! assert_is_specified {
            ($($section:ident . $field:ident),* $(,)?) => {
                $(
                    if self.$section.$field.is_none() {
                        bail!(
                            "configuration file does not contain value for '{0}.{1}', \
                                but it is required (note: this is a production build; \
                                '{0}.{1}' has a default value, but only in non-production builds)",
                            stringify!($section),
                            stringify!($field),
                        );
                    }
                )*
            };
        }

        // Some fields have a default value for development builds. But in the
        // binaries we deploy, we "disable" those defaults to make sure all
        // important values are manually configured. We return an error here, if
        // any of the following fields is not specified.
        if !cfg!(debug_assertions) {
            assert_is_specified!(
                db.user,
                db.password,
                db.host,
            );
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Http {
    pub port: u16,
    pub address: IpAddr,
}

impl Http {
    const DEFAULT_PORT: u16 = 3080;
    const DEFAULT_ADDRESS: IpAddr = IpAddr::V4(Ipv4Addr::LOCALHOST);
}

impl Default for Http {
    fn default() -> Self {
        Self {
            port: Self::DEFAULT_PORT,
            address: Self::DEFAULT_ADDRESS,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Db {
    user: Option<String>,
    password: Option<String>,
    host: Option<String>,
    pub port: u16,
    pub database: String,
}

impl Db {
    const DEFAULT_USER: &'static str = "tobira";
    const DEFAULT_PASSWORD: &'static str = "tobira-dev-db-pw";
    const DEFAULT_HOST: &'static str = "localhost";
    const DEFAULT_PORT: u16 = 5432;
    const DEFAULT_DATABASE: &'static str = "tobira";

    pub fn user(&self) -> &str {
        self.user.as_deref().unwrap_or(Self::DEFAULT_USER)
    }
    pub fn password(&self) -> &str {
        self.password.as_deref().unwrap_or(Self::DEFAULT_PASSWORD)
    }
    pub fn host(&self) -> &str {
        self.host.as_deref().unwrap_or(Self::DEFAULT_HOST)
    }
}

impl Default for Db {
    fn default() -> Self {
        Self {
            user: None,
            password: None,
            host: None,
            port: Self::DEFAULT_PORT,
            database: Self::DEFAULT_DATABASE.into(),
        }
    }
}
