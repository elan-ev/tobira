use secrecy::Secret;
use std::{
    convert::TryInto,
    fs,
    io::{self, Write},
    net::{IpAddr, ToSocketAddrs},
    path::{Path, PathBuf},
};

use tobira_util::prelude::*;


#[cfg(test)]
mod tests;


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
    },
    opencast: {
        /// Host of the connected Opencast instance. This host has to be reachable
        /// via HTTPS (or HTTP, see `use_insecure_connection`). If no port is specified
        /// here, the default HTTPS port 443 (or HTTP port 80) is used.
        #[example = "localhost:8080"]
        host: String,

        /// If set to `true`, Tobira will communicate with Opencast via HTTP instead of
        /// HTTPS. This is strongly recommended against! The HTTP requests contain the
        /// unencrypted `sync_password`! Setting this to `true` is only allowed if
        /// the `host` resolves to a loopback address.
        use_insecure_connection: bool = false,

        /// Username of the user used to communicate with Opencast. This user has to have
        /// access to all events and series.
        sync_user: String = "tobira",

        /// Password of the user used to communicate with Opencast.
        #[example = "D5ntdAKwSx84JdSEpTHYr8nt"]
        sync_password: Secret<String>,
    },
    theme: {
        header_height: u32 = 70,
        header_padding: u32 = 10,

        /// Path to CSS file that includes all used font files and sets the variable
        /// `--main-font` in the `:root` selector. For example:
        ///
        /// ```
        /// :root {
        ///     --main-font: 'Open Sans';
        /// }
        ///
        /// @font-face { font-family: 'Open Sans'; src: ...; }
        /// ```
        ///
        /// If not set, the default font will be used.
        #[example = "fonts.css"]
        fonts: Option<String>,



        logo: {
            /// Path to the "normal", wide logo that is shown on desktop screens.
            #[example = "/etc/tobira/logo-large.svg"]
            large: PathBuf,

            /// Path to the small, close to square logo used for small screens, mostly
            /// on mobile phones.
            #[example = "/etc/tobira/logo-small.svg"]
            small: PathBuf,
        },

        // TODO: make sure color format is valid
        color: {
            navigation: String = "#357C58",

            /// Accent color with large contrast to navigation color.
            accent: String = "#007A96",

            /// Grey tone with 50% lightness/brightness. Several brighter and
            /// darker variants of this are created automatically. This is
            /// configurable in case you want to have a slightly colored grey,
            /// e.g. slightly warm.
            grey50: String = "#808080",
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
        self.opencast.validate()?;

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

        fix_path(&base, &mut self.theme.logo.large);
        fix_path(&base, &mut self.theme.logo.small);

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

impl Opencast {
    fn validate(&self) -> Result<()> {
        let host_as_ip = self.host.parse::<IpAddr>();

        // We only allow HTTP if the host resolves to a loopback (local)
        // address. We send the unencrypted `sync_password`, so HTTPS is
        // required.
        if self.use_insecure_connection {
            debug!("Checking whether Opencast host '{}' is a loopback address", self.host);

            let is_loopback = if let Ok(addr) = host_as_ip {
                addr.is_loopback()
            } else {
                let mut socket_addrs = if self.host.contains(':') {
                    // If the host is not parsable as an IPv6 address (checked
                    // above), a colon means that the port is included in the
                    // string.
                    self.host.to_socket_addrs()?
                } else {
                    (&*self.host, 80u16).to_socket_addrs()?
                };

                socket_addrs.all(|sa| sa.ip().is_loopback())
            };

            if !is_loopback {
                bail!(
                    "`opencast.use_insecure_connection` is set to `true`, but \
                        `opencast.host` ('{}') is not/does not resolve to a loopback address. \
                        For security, this is not allowed.",
                    self.host,
                );
            }
        }

        // Check that the host field is either a valid IP addr or a valid host.
        // That's not quite the same for IPv6, as those have to be enclosed in
        // `[]` in a URI.
        if host_as_ip.is_err() {
            // TODO: this should be a custom parser or whatever so that the
            // struct can hold an `Authority`. Blocked by "config lib".
            self.host.parse::<hyper::http::uri::Authority>()
                .context("'opencast.host' is not a valid URI authority")?;
        }

        Ok(())
    }
}
