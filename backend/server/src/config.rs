use anyhow::{bail, Context, Result};
use log::{debug, info};
use std::{
    convert::TryInto,
    fs,
    net::IpAddr,
    path::Path,
};



tobira_macros::gen_config! {
    //! Configuration for Tobira.

    http: {
        /// The port the HTTP server should listen on.
        port: u16 = 3080,

        /// The bind address to listen on.
        address: IpAddr = "127.0.0.1",
    },
    db: {
        /// The username of the database user.
        #[example = "tobira"]
        user: String,

        /// The password of the database user.
        #[example = "k7SXDj4bwuuodcZ8TBYQ"]
        password: String,

        /// The host the database server is running on.
        #[example = "127.0.0.1"]
        host: String,

        /// The port the database server is listening on. (Just useful if your
        /// database server is not running on the default PostgreSQL port).
        port: u16 = 5432,

        /// The name of the database to use.
        database: String = "tobira",
    },
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
                "no configuration file found. Note: we checked the following paths: {}",
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
        let raw: raw::Config = toml::from_str(&file)
            .context(format!("failed to deserialize '{}' as configuration", path.display()))?;
        let merged = raw::Config::default_values().overwrite_with(raw);
        let config: Self = merged.try_into()?;

        config.validate()?;

        Ok(config)
    }

    /// Performs some validation of the configuration to find some illegal or
    /// conflicting values.
    fn validate(&self) -> Result<()> {
        debug!("Validating configuration...");

        Ok(())
    }
}
