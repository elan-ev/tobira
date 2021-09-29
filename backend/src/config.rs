use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};
use confique::Config as _;

use crate::prelude::*;


/// The locations where Tobira will look for a configuration file. The first
/// existing file in this list is used.
// TODO: does the absolute path break on Windows? I hope it just results in
// "file not found". Or do we want to have a different path for Windows?
const DEFAULT_PATHS: &[&str] = &["config.toml", "/etc/tobira/config.toml"];

/// Configuration for Tobira.
///
/// All relative paths are relative to the location of this configuration file.
#[derive(Debug, confique::Config)]
pub(crate) struct Config {
    #[config(nested)]
    pub(crate) general: GeneralConfig,

    #[config(nested)]
    pub(crate) db: crate::db::DbConfig,

    #[config(nested)]
    pub(crate) http: crate::http::HttpConfig,

    #[config(nested)]
    pub(crate) log: crate::logger::LogConfig,

    #[config(nested)]
    pub(crate) sync: crate::sync::SyncConfig,

    #[config(nested)]
    pub(crate) theme: crate::theme::ThemeConfig,
}

#[derive(Debug, confique::Config)]
pub(crate) struct GeneralConfig {
    /// The main title of the video portal. Used in the HTML `<title>`, as main
    /// heading on the home page, and potentially more.
    ///
    /// TODO: Make it possible to specify this for different languages.
    pub(crate) site_title: String,
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
        self.sync.validate()?;

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

