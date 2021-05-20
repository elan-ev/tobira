use tobira_util::prelude::*;
use crate::{config::Config, db};


mod harvest;
mod status;

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
    harvest::run(config, &**db_connection).await?;

    Ok(())
}
