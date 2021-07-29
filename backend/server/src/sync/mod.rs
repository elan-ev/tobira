use secrecy::Secret;
use std::net::{IpAddr, ToSocketAddrs};

use tobira_util::prelude::*;
use crate::{config::Config, db};


mod harvest;
mod status;

#[cfg(test)]
mod tests;


pub(crate) async fn run(config: &Config) -> Result<()> {
    info!("Starting Tobira <-> Opencast synchronization daemon ...");
    trace!("Configuration: {:#?}", config);

    // Open DB connection, check consistency and migrate if necessary.
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;

    // Harvest continiously.
    let db_connection = db.get().await?;
    harvest::run(&config.sync, &**db_connection).await?;

    Ok(())
}

#[derive(Debug, confique::Config)]
pub(crate) struct SyncConfig {
    /// Host of the connected Opencast instance. This host has to be reachable
    /// via HTTPS (or HTTP, see `use_insecure_connection`). If no port is
    /// specified here, the default HTTPS port 443 (or HTTP port 80) is used.
    /// Example: "localhost:8080".
    host: String,

    /// If set to `true`, Tobira will communicate with Opencast via HTTP instead of
    /// HTTPS. This is strongly recommended against! The HTTP requests contain the
    /// unencrypted `sync_password`! Setting this to `true` is only allowed if
    /// the `host` resolves to a loopback address.
    #[config(default = false)]
    use_insecure_connection: bool,

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
    /// request size restrictions. Too small of a number means that the HTTP
    /// overhead will become more significant, thus slowing down the syncing
    /// process.
    ///
    /// Also, due to `TIME_BUFFER_SIZE` on the Opencast side (see its docs for
    /// more information), if the number of items that change within one
    /// `TIME_BUFFER_SIZE` is larger than this preferred harvest size, lots of
    /// events could be transferred repeatedly via the harvest API.
    #[config(default = 500)]
    preferred_harvest_size: u32,
}

impl SyncConfig {
    pub(crate) fn validate(&self) -> Result<()> {
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
