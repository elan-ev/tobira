use secrecy::Secret;
use std::time::Duration;

use crate::{config::Config, db, prelude::*, util::HttpHost};


mod harvest;
mod status;


pub(crate) async fn run(daemon: bool, config: &Config) -> Result<()> {
    info!("Starting Tobira <-> Opencast synchronization ...");
    trace!("Configuration: {:#?}", config);

    // Open DB connection, check consistency and migrate if necessary.
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;

    // Get client for MeiliSearch index.
    let search = config.meili.connect().await
        .context("failed to connect to MeiliSearch")?;

    // Harvest continiously.
    let db_connection = db.get().await?;
    harvest::run(daemon, &config.sync, db_connection, &search).await?;

    Ok(())
}

#[derive(Debug, confique::Config)]
pub(crate) struct SyncConfig {
    /// Host of the connected Opencast instance. This host has to be reachable
    /// via HTTPS or HTTP. If no port is specified here, the default HTTPS port
    /// 443 (or HTTP port 80) is used.
    ///
    /// The HTTP requests to Opencast contain the unencrypted `password`, so
    /// using HTTPS is strongly encouraged. In fact, HTTP is only allowed if
    /// the host resolves to a loopback address.
    ///
    /// Example: "localhost:8080".
    pub(crate) host: HttpHost,

    /// Username of the user used to communicate with Opencast. This user has to have
    /// access to all events and series. Currently, that user has to be admin.
    user: String,

    /// Password of the user used to communicate with Opencast.
    password: Secret<String>,

    /// A rough estimate of how many items (events & series) are transferred in
    /// each HTTP request while harvesting (syncing) with the Opencast
    /// instance.
    ///
    /// A very large number might cause problems due to the Opencast or Tobira
    /// node having to hold that many items in memory, or due to network
    /// request size restrictions. Too small of a number not means that the
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

impl SyncConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        self.host.assert_safety().context("failed to validate 'sync.host'")?;
        Ok(())
    }
}
