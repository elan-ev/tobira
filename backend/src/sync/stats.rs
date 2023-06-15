use std::time::Duration;

use serde::Serialize;
use tokio_postgres::Row;

use crate::{config::Config, db::DbConnection, prelude::*};

use super::OcClient;


/// How often Tobira sends statistics to Opencast.
const SEND_PERIOD: Duration = Duration::from_secs(60 * 60 * 24);

/// Regularly sends statistical data to Opencast. If the Opencast admin agreed
/// to sharing basic data as part of adopter registration, this data is sent to
/// the Opencast server. Otherwise it is not used at all (and only stored in
/// memory at the Opencast side).
pub(crate) async fn run_daemon(db: DbConnection, config: &Config) -> ! {
    // Let the other more important worker processes do stuff first. This is
    // mainly to have less interleaved output in the log.
    tokio::time::sleep(Duration::from_secs(3)).await;

    let client = OcClient::new(config);

    loop {
        if let Err(e) = send_stats(&client, &db, config).await {
            warn!("Failed to send stats for adopter registration to Opencast: {e:?}");
        }
        tokio::time::sleep(SEND_PERIOD).await;
    }
}

async fn send_stats(client: &OcClient, db: &DbConnection, config: &Config) -> Result<()> {
    let stats = Stats::gather(db, config).await.context("failed to gather stats")?;
    let json = serde_json::to_string(&stats).context("failed to serialize stats")?;
    client.send_stats(json).await?;
    debug!(
        "Sent statistics to Opencast (only used for adopter registration, if opted-in). {:#?}",
        stats,
    );

    Ok(())
}


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Stats {
    num_realms: u32,
    num_blocks: u32,
    version: VersionStats,
    config: ConfigStats,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionStats {
    identifier: String,
    build_time_utc: &'static str,
    git_commit_hash: &'static str,
    git_was_dirty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigStats {
    /// Value of `general.show_download_button`.
    download_button_shown: bool,
    /// Value of `auth.mode`
    auth_mode: &'static str,
    /// Whether `auth.login_link` is set or not.
    login_link_overwritten: bool,
    /// Whether `auth.logout_link` is set or not.
    logout_link_overwritten: bool,
    /// Value of `auth.pre_auth_external_links`.
    uses_pre_auth: bool,
    /// Whether `theme.logo.small` is set.
    has_narrow_logo: bool,
}


impl Stats {
    async fn gather(db: &DbConnection, config: &Config) -> Result<Self> {
        let get_count = |row: Row| -> u32 {
            row.get::<_, i64>(0).try_into().expect("count does not fit u32")
        };
        let num_realms = get_count(db.query_one("select count(*) from realms", &[]).await?);
        let num_blocks = get_count(db.query_one("select count(*) from blocks", &[]).await?);


        Ok(Self {
            num_realms,
            num_blocks,
            version: VersionStats {
                identifier: crate::version::identifier(),
                build_time_utc: crate::version::build_time_utc(),
                git_commit_hash: crate::version::git_commit_hash(),
                git_was_dirty: crate::version::git_was_dirty(),
            },
            config: ConfigStats {
                download_button_shown: config.general.show_download_button,
                auth_mode: config.auth.mode.label(),
                login_link_overwritten: config.auth.login_link.is_some(),
                logout_link_overwritten: config.auth.logout_link.is_some(),
                uses_pre_auth: config.auth.pre_auth_external_links,
                has_narrow_logo: config.theme.logo.small.is_some(),
            },
        })
    }
}
