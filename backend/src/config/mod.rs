use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use confique::Config as _;

use crate::prelude::*;


mod color;
mod general;
mod theme;
mod translated_string;
mod opencast;

pub(crate) use self::{
    color::{Color, Hsl},
    translated_string::TranslatedString,
    theme::ThemeConfig,
    opencast::OpencastConfig,
};


/// The locations where Tobira will look for a configuration file. The first
/// existing file in this list is used.
// TODO: does the absolute path break on Windows? I hope it just results in
// "file not found". Or do we want to have a different path for Windows?
const DEFAULT_PATHS: &[&str] = &["config.toml", "/etc/tobira/config.toml"];

const TOBIRA_CONFIG_PATH_ENV: &str = "TOBIRA_CONFIG_PATH";

/// Configuration for Tobira.
///
/// All relative paths are relative to the location of this configuration file.
/// Duration values are specified as string with a unit, e.g. "27s". Valid
/// units: 'ms', 's', 'min', 'h' and 'd'.
///
/// All user-facing texts you can configure here have to be specified per
/// language, with two letter language key. Only English ('en') is required.
/// Take `general.site_title` for example:
///
///     [general]
///     site_title.en = "My university"
///     site_title.de = "Meine Universität"
///
#[derive(Debug, confique::Config)]
pub(crate) struct Config {
    #[config(nested)]
    pub(crate) general: general::GeneralConfig,

    #[config(nested)]
    pub(crate) db: crate::db::DbConfig,

    #[config(nested)]
    pub(crate) http: crate::http::HttpConfig,

    #[config(nested)]
    pub(crate) auth: crate::auth::AuthConfig,

    #[config(nested)]
    pub(crate) log: crate::logger::LogConfig,

    #[config(nested)]
    pub(crate) opencast: OpencastConfig,

    #[config(nested)]
    pub(crate) sync: crate::sync::SyncConfig,

    #[config(nested)]
    pub(crate) meili: crate::search::MeiliConfig,

    #[config(nested)]
    pub(crate) theme: ThemeConfig,
}

impl Config {
    /// Tries to find a config file from a list of possible default config file
    /// locations. The first config file is loaded via [`Self::load_from`].
    pub fn from_env_or_default_locations() -> Result<Self> {
        let path = if let Some(path) = std::env::var_os(TOBIRA_CONFIG_PATH_ENV) {
            PathBuf::from(path)
        } else {
            DEFAULT_PATHS.iter()
                .map(PathBuf::from)
                .find(|p| p.exists())
                .ok_or(anyhow!(
                    "no configuration file found. Note: we checked the following paths: {}",
                    DEFAULT_PATHS.join(", "),
                ))?
        };

        let config = Self::load_from(&path)
            .context(format!("failed to load configuration from '{}'", path.display()))?;

        Ok(config)
    }

    /// Loads the configuration from a specific TOML file.
    pub fn load_from(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        info!("Loading configuration from '{}'", path.display());

        let mut config = Config::from_file(path)
            .context(format!("failed to read config file '{}'", path.display()))?;

        config.validate().context("failed to validate configuration")?;
        config.fix_paths(path)?;

        Ok(config)
    }

    /// Performs some validation of the configuration to find some
    /// illegal or conflicting values.
    fn validate(&self) -> Result<()> {
        debug!("Validating configuration...");
        self.opencast.validate()?;
        self.db.validate()?;

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

        fix_path(&base, &mut self.theme.logo.large.path);
        fix_path(&base, &mut self.theme.logo.small.path);
        fix_path(&base, &mut self.theme.favicon);
        fix_path(&base, &mut self.auth.jwt.secret_key);

        Ok(())
    }
}

/// Writes the generated TOML config template file to the given destination or
/// stdout.
pub(crate) fn write_template(path: Option<&PathBuf>) -> Result<()> {
    use confique::toml::FormatOptions;

    info!(
        "Writing configuration template to '{}'",
        path.map(|p| p.display().to_string()).unwrap_or("<stdout>".into()),
    );

    let template = confique::toml::format::<Config>(FormatOptions::default());
    match path {
        Some(path) => fs::write(path, template)?,
        None => io::stdout().write_all(template.as_bytes())?,
    }

    Ok(())
}

/// Our custom format for durations. We allow a couple useful units and required
/// a unit to increase readability of config files.
pub(crate) fn deserialize_duration<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where D: serde::Deserializer<'de>,
{
    use serde::{Deserialize, de::Error};

    let s = String::deserialize(deserializer)?;
    let start_unit = s.find(|c: char| !c.is_digit(10))
        .ok_or_else(|| D::Error::custom("no time unit for duration"))?;
    let (num, unit) = s.split_at(start_unit);
    let num: u32 = num.parse()
        .map_err(|e| D::Error::custom(format!("invalid integer for duration: {}", e)))?;
    let num: u64 = num.into();

    match unit {
        "ms" => Ok(Duration::from_millis(num)),
        "s" => Ok(Duration::from_secs(num)),
        "min" => Ok(Duration::from_secs(num * 60)),
        "h" => Ok(Duration::from_secs(num * 60 * 60)),
        "d" => Ok(Duration::from_secs(num * 60 * 60 * 24)),
        _ => Err(D::Error::custom("invalid unit of time for duration")),
    }
}
