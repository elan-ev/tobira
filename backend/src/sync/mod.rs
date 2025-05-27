use core::fmt;
use std::{collections::HashMap, str::FromStr, time::Duration};

use deadpool_postgres::Pool;

use crate::{config::Config, prelude::*};


pub(crate) mod cmd;
pub(crate) mod harvest;
pub(crate) mod stats;
pub(crate) mod text;
pub(crate) mod client;
mod status;

pub(crate) use self::client::OcClient;


/// The minimum API version this Tobira requires from the Tobira-module API.
const MIN_REQUIRED_API_VERSION: ApiVersion = ApiVersion::new(1, 0);


pub(crate) async fn run(daemon: bool, pool: &Pool, config: &Config) -> Result<()> {
    let client = OcClient::new(config)?;
    check_compatibility(&client).await?;
    harvest::run(daemon, config, &client, pool).await
}

pub(crate) async fn check_compatibility(client: &OcClient) -> Result<()> {
    let response = client.get_tobira_api_version().await.context("failed to fetch API version")?;
    let version = response.version();
    if !version.is_compatible() {
        bail!("Tobira-module API version incompatible! Required: \
            `^{MIN_REQUIRED_API_VERSION}`, but actual version is: {version}");
    }

    info!("Tobira-module API version is compatible. Required: \
        `^{MIN_REQUIRED_API_VERSION}`, actual version: {version}");
    Ok(())
}

#[derive(Debug, confique::Config)]
pub(crate) struct SyncConfig {
    /// A rough estimate of how many items (events & series) are transferred in
    /// each HTTP request while harvesting (syncing) with the Opencast
    /// instance.
    ///
    /// A very large number might cause problems due to the Opencast or Tobira
    /// node having to hold that many items in memory, or due to network
    /// request size restrictions. Too small of a number means that the
    /// overhead of each request will become more significant, slowing down
    /// harvesting. But more importantly: if your Opencast instance has more
    /// items with exactly the same `updated` timestamp than the configured
    /// `preferred_harvest_size`, Tobira is unable to harvest. The `updated`
    /// timestamp is has millisecond precision, so this situation is highly
    /// unlikely to occur naturally. However, this can easily occur with
    /// artificial timestamps, like when you migrate old Opencast data
    /// (without an `updated` timestamp). Be aware of that.
    #[config(default = 500)]
    preferred_harvest_size: u32,

    /// The duration to wait after a "no new data" reply from Opencast. Only
    /// relevant in `--daemon` mode.
    #[config(default = "30s", deserialize_with = crate::config::deserialize_duration)]
    pub(crate) poll_period: Duration,

    /// Whether SHA1-hashed series passwords (as assignable by ETH's admin UI
    /// build) are interpreted in Tobira.
    #[config(default = false)]
    pub(crate) interpret_eth_passwords: bool,

    /// Number of concurrent tasks with which Tobira downloads assets from
    /// Opencast. The default should be a good sweet spot. Decrease to reduce
    /// load on Opencast, increase to speed up download a bit.
    #[config(default = 8)]
    concurrent_download_tasks: u8,

    /// List of deletion modes that determine which, if any, realm pages are to be deleted
    /// automatically when the corresponding Opencast item (series, event or playlist)
    /// is deleted.
    /// If configured, Tobira will delete the corresponding realm page(s) when they meet
    /// the following conditions:
    /// - Realm name is derived from the deleted item.
    /// - Realm has no sub realms.
    /// - Realm has no other blocks than the deleted item.
    ///
    /// The last option can be disabled by adding `:eager` to the deletion mode.
    ///
    /// Example:
    /// ```
    /// auto_delete_pages = ["series", "events:eager"]
    /// ```
    ///
    /// This would delete series pages in non-eager mode and event pages in eager mode.
    #[config(default = [], validate = validate_deletion_modes)]
    pub auto_delete_pages: Vec<DeletionMode>,
}

/// Version of the Tobira-module API in Opencast.
struct ApiVersion {
    major: u32,
    minor: u32,
}

impl ApiVersion {
    const fn new(major: u32, minor: u32) -> Self {
        Self { major, minor }
    }

    /// Returns `true` if the API version `self` can be used with this Tobira,
    /// according to `MIN_REQUIRED_API_VERSION`.
    fn is_compatible(&self) -> bool {
        self.major == MIN_REQUIRED_API_VERSION.major
            && self.minor >= MIN_REQUIRED_API_VERSION.minor
    }
}

impl fmt::Display for ApiVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}", self.major, self.minor)
    }
}

impl std::str::FromStr for ApiVersion {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let (major, minor) = s.split_once('.').ok_or("invalid API version string")?;

        Ok(Self {
            major: major.parse().map_err(|_| "invalid major version number")?,
            minor: minor.parse().map_err(|_| "invalid minor version number")?,
        })
    }
}

#[derive(Debug, serde::Deserialize)]
pub(crate) struct VersionResponse {
    version: String,
}

impl VersionResponse {
    fn version(&self) -> ApiVersion {
        self.version.parse().expect("invalid version string")
    }
}


#[derive(Debug, serde::Deserialize)]
#[serde(try_from = "String")]
pub enum DeletionMode {
    Series { eager: bool },
    Events { eager: bool },
    Playlists { eager: bool },
}

impl FromStr for DeletionMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "series" => Ok(Self::Series { eager: false }),
            "series:eager" => Ok(Self::Series { eager: true }),

            "events" => Ok(Self::Events { eager: false }),
            "events:eager" => Ok(Self::Events { eager: true }),

            "playlists" => Ok(Self::Playlists { eager: false }),
            "playlists:eager" => Ok(Self::Playlists { eager: true }),

            other => Err(format!("Invalid auto_delete_pages value: {}", other)),
        }
    }
}

impl TryFrom<String> for DeletionMode {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        DeletionMode::from_str(&value)
    }
}

fn validate_deletion_modes(modes: &Vec<DeletionMode>) -> Result<(), String> {
    let mut entries = HashMap::new();

    for (i, mode) in modes.iter().enumerate() {
        let kind = match mode {
            DeletionMode::Series { .. } => "series",
            DeletionMode::Events { .. } => "events",
            DeletionMode::Playlists { .. } => "playlists",
        };

        if let Some(prev_index) = entries.insert(kind, i) {
            return Err(format!(
                "Cannot configure a mode for '{kind}' more than once. \
                    There are conflicting entries at positions {} and {}.",
                prev_index + 1,
                i + 1,
            ));
        }
    }

    Ok(())
}
