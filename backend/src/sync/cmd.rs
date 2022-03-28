use crate::{
    config::Config,
    prelude::*,
};


/// Entry point for `search-index` commands.
pub(crate) async fn run(daemon: bool, config: &Config) -> Result<()> {
    info!("Starting Tobira <-> Opencast synchronization ...");
    trace!("Configuration: {:#?}", config);

    let db = crate::connect_and_migrate_db(config).await?;
    let conn = db.get().await?;
    super::run(daemon, conn, config).await
}
