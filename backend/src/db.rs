//! Database related things.

use anyhow::Result;
use deadpool_postgres::{Config, Pool};
use log::{debug, info, trace};
use tokio_postgres::NoTls;

use crate::config;


/// Creates a new database connection pool.
pub async fn create_pool(config: &config::Db) -> Result<Pool> {
    let config = Config {
        user: Some(config.user().into()),
        password: Some(config.password().into()),
        host: Some(config.host().into()),
        port: Some(config.port),
        dbname: Some(config.database.clone()),
        .. Config::default()
    };

    trace!("Database configuration: {:#?}", config);

    let pool = config.create_pool(NoTls)?;
    info!("Created database pool");

    // Test the connection by executing a simple query.
    pool.get().await?.execute("SELECT 1", &[]).await?;
    debug!("Successfully tested database connection with test query");

    Ok(pool)
}
