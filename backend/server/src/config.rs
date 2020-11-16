use anyhow::{anyhow, Context, Result};
use log::{debug, info};
use secrecy::Secret;
use std::{
    convert::TryInto,
    fs,
    io::{self, Write},
    net::IpAddr,
    path::{Path, PathBuf},
};


/// The locations where Tobira will look for a configuration file. The first
/// existing file in this list is used.
// TODO: does the absolute path break on Windows? I hope it just results in
// "file not found". Or do we want to have a different path for Windows?
const DEFAULT_PATHS: &[&str] = &["config.toml", "/etc/tobira/config.toml"];

// This macro generates a bunch of structs and other items describing our
// configuration.
tobira_macros::gen_config! {
    //! Configuration for Tobira.

    db: {
        /// The username of the database user.
        #[example = "tobira"]
        user: String,

        /// The password of the database user.
        #[example = "k7SXDj4bwuuodcZ8TBYQ"]
        password: Secret<String>,

        /// The host the database server is running on.
        #[example = "127.0.0.1"]
        host: String,

        /// The port the database server is listening on. (Just useful if your
        /// database server is not running on the default PostgreSQL port).
        port: u16 = 5432,

        /// The name of the database to use.
        database: String = "tobira",
    },
    http: {
        /// The port the HTTP server should listen on.
        port: u16 = 3080,

        /// The bind address to listen on.
        address: IpAddr = "127.0.0.1",
    },
    log: {
        /// Determines how many messages are logged. Log messages below
        /// this level are not emitted. Possible values: "trace", "debug",
        /// "info", "warn", "error" and "off".
        level: log::LevelFilter = "debug",

        /// If this is set, log messages are also written to this file.
        #[example = "/var/log/tobira.log"]
        file: Option<String>,

        /// If this is set to `false`, log messages are not written to stdout.
        stdout: bool = true,
    },
}

impl Config {
    /// Tries to find a config file from a list of possible default config file
    /// locations. The first config file is loaded via [`Self::load_from`].
    pub fn from_default_locations() -> Result<Self> {
        let path = DEFAULT_PATHS.iter()
            .map(Path::new)
            .find(|p| p.exists())
            .ok_or(anyhow!(
                "no configuration file found. Note: we checked the following paths: {}",
                DEFAULT_PATHS.join(", "),
            ))?;

        let config = Self::load_from(path)
            .context(format!("failed to load configuration from '{}'", path.display()))?;

        Ok(config)
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

        config.validate().context("failed to validate configuration")?;

        Ok(config)
    }

    /// Performs some validation of the configuration to find some
    /// illegal or conflicting values.
    fn validate(&self) -> Result<()> {
        debug!("Validating configuration...");

        Ok(())
    }
}

/// Writes the generated TOML config template file to the given destination or
/// stdout.
pub(crate) fn write_template(path: Option<&PathBuf>) -> Result<()> {
    info!(
        "Writing configuration template to '{}'",
        path.map(|p| p.display().to_string()).unwrap_or("<stdout>".into()),
    );

    match path {
        Some(path) => fs::write(path, TOML_TEMPLATE)?,
        None => io::stdout().write_all(TOML_TEMPLATE.as_bytes())?,
    }

    Ok(())
}
