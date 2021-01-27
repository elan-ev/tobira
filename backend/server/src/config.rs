use secrecy::Secret;
use std::{
    convert::TryInto,
    fs,
    io::{self, Write},
    net::IpAddr,
    path::{Path, PathBuf},
};

use tobira_util::prelude::*;


/// The locations where Tobira will look for a configuration file. The first
/// existing file in this list is used.
// TODO: does the absolute path break on Windows? I hope it just results in
// "file not found". Or do we want to have a different path for Windows?
const DEFAULT_PATHS: &[&str] = &["config.toml", "/etc/tobira/config.toml"];

// This macro generates a bunch of structs and other items describing our
// configuration.
tobira_macros::gen_config! {
    //! Configuration for Tobira.
    //!
    //! All relative paths are relative to the location of this configuration
    //! file.

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
        /// The TCP port the HTTP server should listen on.
        port: u16 = 3080,

        /// The bind address to listen on.
        address: IpAddr = "127.0.0.1",

        /// Unix domain socket to listen on. Specifying this will overwrite
        /// the TCP configuration.
        #[example = "/tmp/tobira.socket"]
        unix_socket: Option<PathBuf>,

        /// Unix domain socket file permissions.
        unix_socket_permissions: u32 = 0o755,
    },
    log: {
        /// Determines how many messages are logged. Log messages below
        /// this level are not emitted. Possible values: "trace", "debug",
        /// "info", "warn", "error" and "off".
        level: log::LevelFilter = "debug",

        /// If this is set, log messages are also written to this file.
        #[example = "/var/log/tobira.log"]
        file: Option<PathBuf>,

        /// If this is set to `false`, log messages are not written to stdout.
        stdout: bool = true,
    },
    assets: {
        /// Path to internal assets. This is only relevant for Tobira developers. This
        /// must not be set for production builds of Tobira.
        internal: PathBuf = "../frontend/build",

        logo: {
            /// Path to the "normal", wide logo that is shown on desktop screens.
            #[example = "/etc/tobira/logo-large.svg"]
            large: PathBuf,

            /// Path to the small, close to square logo used for small screens, mostly
            /// on mobile phones.
            #[example = "/etc/tobira/logo-small.svg"]
            small: PathBuf,
        },
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
        let mut config: Self = merged.try_into()?;

        config.validate().context("failed to validate configuration")?;
        config.fix_paths(path)?;

        Ok(config)
    }

    /// Performs some validation of the configuration to find some
    /// illegal or conflicting values.
    fn validate(&self) -> Result<()> {
        debug!("Validating configuration...");

        Ok(())
    }

    /// Goes through all paths in the configuration and changes relative paths
    /// to be absolute based on the path of the configuration file itself.
    fn fix_paths(&mut self, config_path: &Path) -> Result<()> {
        fn fix_path(base_path: &Path, path: &mut PathBuf) {
            if path.is_relative() {
                *path = base_path.join(&path);
            }
        }

        let absolute_config_path = config_path.canonicalize()
            .context("failed to canonicalize config path")?;
        let base = absolute_config_path.parent()
            .expect("config file path has no parent");

        if let Some(p) = &mut self.http.unix_socket {
            fix_path(&base, p);
        }

        if let Some(p) = &mut self.log.file {
            fix_path(&base, p);
        }

        fix_path(&base, &mut self.assets.logo.large);
        fix_path(&base, &mut self.assets.logo.small);

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
