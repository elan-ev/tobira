use base64::Engine as _;
use secrecy::{ExposeSecret as _, Secret};
use core::fmt;
use std::time::Duration;

use crate::{config::Config, db::DbConnection, prelude::*};


pub(crate) mod cmd;
pub(crate) mod harvest;
pub(crate) mod stats;
pub(crate) mod text;
mod client;
mod status;

pub(crate) use self::client::OcClient;


/// The minimum API version this Tobira requires from the Tobira-module API.
const MIN_REQUIRED_API_VERSION: ApiVersion = ApiVersion::new(1, 0);


pub(crate) async fn run(daemon: bool, db: DbConnection, config: &Config) -> Result<()> {
    let client = OcClient::new(config)?;
    check_compatibility(&client).await?;
    harvest::run(daemon, config, &client, db).await
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
    /// Username of the user used to communicate with Opencast for data syncing.
    /// This user has to have access to all events and series. Currently, that
    /// user has to be admin.
    user: String,

    /// Password of the user used to communicate with Opencast.
    password: Secret<String>,

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

    /// Number of concurrent tasks with which Tobira downloads assets from
    /// Opencast. The default should be a good sweet spot. Decrease to reduce
    /// load on Opencast, increase to speed up download a bit.
    #[config(default = 8)]
    concurrent_download_tasks: u8,
}

impl SyncConfig {
    pub(crate) fn basic_auth_header(&self) -> Secret<String> {
        let credentials = format!("{}:{}", self.user, self.password.expose_secret());
        let encoded_credentials = base64::engine::general_purpose::STANDARD.encode(credentials);
        let auth_header = format!("Basic {}", encoded_credentials);
        Secret::new(auth_header)
    }
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
