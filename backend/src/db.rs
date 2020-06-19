//! Database related things.

use anyhow::Result;
use tokio_postgres::NoTls;
use deadpool_postgres::{Config, Pool};
use crate::config;


/// Creates a new database connection pool.
pub async fn create_pool(config: &config::Db) -> Result<Pool> {
    // TODO: read config from file
    let config = Config {
        user: Some(config.user().into()),
        password: Some(config.password().into()),
        host: Some(config.host().into()),
        port: Some(config.port),
        dbname: Some(config.database.clone()),
        .. Config::default()
    };

    let pool = config.create_pool(NoTls)?;

    // Test the connection by executing a simple query.
    pool.get().await?.execute("SELECT 1", &[]).await?;

    Ok(pool)
}
