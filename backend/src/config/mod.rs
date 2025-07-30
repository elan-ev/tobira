use std::{
    fmt, fs, io::{self, Write}, net::{Ipv4Addr, Ipv6Addr}, path::{Path, PathBuf}, str::FromStr, time::Duration
};
use confique::Config as _;
use hyper::Uri;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::prelude::*;


mod color;
mod general;
mod theme;
mod matomo;
mod opencast;
mod player;
mod upload;

pub(crate) use self::{
    theme::{ThemeConfig, LogoDef},
    matomo::MatomoConfig,
    opencast::OpencastConfig,
    player::PlayerConfig,
    upload::UploadConfig,
};


/// The locations where Tobira will look for a configuration file. The first
/// existing file in this list is used.
// TODO: does the absolute path break on Windows? I hope it just results in
// "file not found". Or do we want to have a different path for Windows?
const DEFAULT_PATHS: &[&str] = &[
    // For better DX, we include this special path here, but just in debug mode.
    #[cfg(debug_assertions)]
    "../util/dev-config/config.toml",

    "config.toml",
    "/etc/tobira/config.toml",
];

const TOBIRA_CONFIG_PATH_ENV: &str = "TOBIRA_CONFIG_PATH";

/// Configuration for Tobira.
///
/// All relative paths are relative to the location of this configuration file.
/// Duration values are specified as string with a unit, e.g. "27s". Valid
/// units: 'ms', 's', 'min', 'h' and 'd'.
///
/// All user-facing texts you can configure here have to be specified per
/// language, with two letter language key. The special key 'default' is
/// required and used as fallback for languages that are not specified
/// explicitly. Take `general.site_title` for example:
///
///     [general]
///     site_title.default = "My university"
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

    /// See the relevant chapter in our documentation on how to configure this section.
    #[config(nested)]
    pub(crate) theme: ThemeConfig,

    #[config(nested)]
    pub(crate) upload: UploadConfig,

    /// Matomo integration (optional). Currently only used by Paella if configured.
    #[config(nested)]
    pub(crate) matomo: MatomoConfig,

    #[config(nested)]
    pub(crate) player: PlayerConfig,
}

impl Config {
    /// Tries to find a config file by checking `TOBIRA_CONFIG_PATH` and from a
    /// list of possible default config file locations. The first config file
    /// is loaded via[`Self::load_from`]. Returns the loaded config and the
    /// path that it was loaded from.
    pub fn from_env_or_default_locations() -> Result<(Self, PathBuf)> {
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

        Ok((config, path))
    }

    /// Loads the configuration from a specific TOML file.
    pub fn load_from(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let mut config = Config::from_file(path)
            .context(format!("failed to read config file '{}'", path.display()))?;

        config.fix_paths(path)?;

        Ok(config)
    }

    /// Checks the config for problematic things that deserve a warning, but
    /// should not bring down Tobira.
    pub(crate) fn lint(&self) {
        self.theme.color.lint();
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

        for logo in &mut self.theme.logos {
            fix_path(&base, &mut logo.path);
        }
        fix_path(&base, &mut self.theme.favicon);
        if let Some(p) = &mut self.theme.font.extra_css {
            fix_path(&base, p);
        }
        for font_path in &mut self.theme.font.files {
            fix_path(&base, font_path);
        }
        if let Some(jwt_key) = &mut self.auth.jwt.secret_key {
            fix_path(&base, jwt_key);
        }

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

    let mut options = FormatOptions::default();
    options.general.nested_field_gap = 2;
    let template = confique::toml::template::<Config>(options);
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
    use serde::de::Error;

    let s = String::deserialize(deserializer)?;

    // Allow unit-less zeroes
    if s == "0" {
        return Ok(Duration::ZERO);
    }

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

/// Parses a URI with some default checks. Is required to have an HTTP(S)
/// scheme, an authority, no userinfo, no query part. A path is allowed. Is
/// checked for HTTPS security.
pub(crate) fn parse_normal_http_uri(src: &str) -> Result<Uri> {
    const SAFE_WORD: &str = "allow-insecure";

    let url: Url = src.parse().map_err(|e| anyhow!("invalid URL: {e}"))?;

    anyhow::ensure!(url.query().is_none(), "URL must not contain a query part");
    anyhow::ensure!(!url.fragment().is_some_and(|f| f != SAFE_WORD),
        "URL must not have a fragment part, except for optionally '{SAFE_WORD}'");
    anyhow::ensure!(url.username().is_empty(), "URL must not contain username part");
    anyhow::ensure!(url.password().is_none(), "URL must not contain password part");
    anyhow::ensure!(["http", "https"]. contains(&url.scheme()),
        "URL scheme must be 'http' or 'https'");

    let host = url.host_str().ok_or(anyhow!("URL must have a host"))?;
    let is_local = {
        let bracketed_ipv6 =
            (|| host.strip_prefix('[')?.strip_suffix(']')?.parse::<Ipv6Addr>().ok())();


        if let Some(ipv6) = bracketed_ipv6 {
            ipv6.is_loopback()
        } else if let Ok(ipv4) = host.parse::<Ipv4Addr>() {
            ipv4.is_loopback()
        } else {
            // Sure, "localhost" could resolve to anything. But this check
            // is for catching human errors, not for defending against
            // attackers, so nothing here needs to be bulletproof.
            host == "localhost"
        }
    };

    if url.scheme() != "https" && !(is_local || url.fragment() == Some(SAFE_WORD)) {
        bail!("Potentially dangerous URL with non-local host and 'http' scheme. \
            If you really want to use unencrypted HTTP for non-local hosts, \
            confirm by specifing the host as '{url}#{SAFE_WORD}'");
    }

    Uri::builder()
        .scheme(url.scheme())
        .authority(url.authority())
        .path_and_query(url.path())
        .build()
        .unwrap()
        .pipe(Ok)
}


#[derive(Clone, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub(crate) struct HttpHost {
    pub(crate) scheme: hyper::http::uri::Scheme,
    pub(crate) authority: hyper::http::uri::Authority,
}

impl HttpHost {
    /// Returns a full URI by combining `self` with the given path+query. Panics
    /// if `pq` is malformed!
    pub fn with_path_and_query(self, pq: &str) -> Uri {
        Uri::builder()
            .scheme(self.scheme)
            .authority(self.authority)
            .path_and_query(pq)
            .build()
            .expect("invalid URI path+query")
    }
}

impl fmt::Display for HttpHost {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}://{}", self.scheme, self.authority)
    }
}

impl fmt::Debug for HttpHost {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl From<HttpHost> for String {
    fn from(value: HttpHost) -> Self {
        value.to_string()
    }
}

impl FromStr for HttpHost {
    type Err = anyhow::Error;
    fn from_str(src: &str) -> Result<Self, Self::Err> {
        let parts = parse_normal_http_uri(src)?.into_parts();
        let authority = parts.authority.unwrap();
        let scheme = parts.scheme.unwrap();

        let has_real_path = parts.path_and_query.as_ref()
            .map_or(false, |pq| !pq.as_str().is_empty() && pq.as_str() != "/");
        anyhow::ensure!(!has_real_path, "invalid HTTP host: must not contain a path");

        Ok(Self { scheme, authority })
    }
}

impl TryFrom<String> for HttpHost {
    type Error = <Self as FromStr>::Err;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}


#[cfg(test)]
mod tests {
    use super::HttpHost;

    fn parse_http_host(s: &str) -> HttpHost {
        s.parse::<HttpHost>().expect(&format!("could not parse '{s}' as HttpHost"))
    }

    const LOCAL_HOSTS: &[&str] = &[
        "localhost",
        "localhost:1234",
        "127.0.0.1",
        "127.0.0.1:4321",
        "127.1.2.3",
        "127.1.2.3:4321",
        "[::1]",
        "[::1]:4321",
    ];

    const NON_LOCAL_HOSTS: &[&str] = &[
        "1.1.1.1",
        "1.1.1.1:3456",
        "[2606:4700:4700::1111]",
        "[2606:4700:4700::1111]:3456",
        "github.com",
        "github.com:3456",
    ];

    #[test]
    fn http_host_parse_https() {
        for host in LOCAL_HOSTS.iter().chain(NON_LOCAL_HOSTS) {
            parse_http_host(&format!("https://{host}"));
        }
    }

    #[test]
    fn http_host_parse_http_local() {
        for host in LOCAL_HOSTS {
            parse_http_host(&format!("http://{host}"));
        }
    }

    #[test]
    fn http_host_parse_http_non_local_safeword() {
        for host in NON_LOCAL_HOSTS {
            parse_http_host(&format!("http://{host}#allow-insecure"));
        }
    }

    #[test]
    fn http_host_parse_http_non_local_error() {
        for host in NON_LOCAL_HOSTS {
            format!("http://{host}").parse::<HttpHost>().unwrap_err();
        }
    }
}
