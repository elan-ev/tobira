use secrecy::Secret;
use std::time::Duration;

use crate::{config::Config, db::DbConnection, prelude::*};


pub(crate) mod cmd;
mod harvest;
mod status;


pub(crate) async fn run(daemon: bool, db: DbConnection, config: &Config) -> Result<()> {
    harvest::run(daemon, config, db).await
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
    poll_period: Duration,
}

