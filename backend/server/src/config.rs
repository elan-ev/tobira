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
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    #[serde(default)]
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
            bail!(
                "no configuration file found. Hint: we checked the following paths: {}",
                default_locations.join(", "),
            );
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
#[serde(deny_unknown_fields)]
pub struct Db {
    pub user: String,
    pub password: String,
    pub host: String,
    port: Option<u16>,
    database: Option<String>,
}

impl Db {
    const DEFAULT_PORT: u16 = 5432;
    const DEFAULT_DATABASE: &'static str = "tobira";

    pub fn port(&self) -> u16 {
        self.port.unwrap_or(Self::DEFAULT_PORT)
    }
    pub fn database(&self) -> &str {
        self.database.as_deref().unwrap_or(Self::DEFAULT_DATABASE)
    }
}
