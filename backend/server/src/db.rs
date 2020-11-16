//! Database related things.

use anyhow::{bail, Context, Result};
use deadpool_postgres::{Config as PoolConfig, Pool};
use log::{debug, info};
use secrecy::ExposeSecret;
use tokio_postgres::NoTls;

use crate::config;


/// Creates a new database connection pool.
pub(crate) async fn create_pool(config: &config::Db) -> Result<Pool> {
    let pool_config = PoolConfig {
        user: Some(config.user.clone()),
        password: Some(config.password.expose_secret().clone()),
        host: Some(config.host.clone()),
        port: Some(config.port),
        dbname: Some(config.database.clone()),
        .. PoolConfig::default()
    };

    debug!(
        "Connecting to postgresql://{}:*****@{}:{}/{}",
        config.user,
        config.host,
        config.port,
        config.database,
    );

    let pool = pool_config.create_pool(NoTls)?;
    info!("Created database pool");

    // Test the connection by executing a simple query.
    let connection = pool.get().await
        .context("failed to get DB connection")?;
    connection.execute("SELECT 1", &[]).await
        .context("failed to execute DB test query")?;
    let n_roots = connection.execute("SELECT * from realms where id = 0", &[]).await
        .context("failed to check")?;
    if n_roots < 1 {
        bail!("no root realm found");
    } else if n_roots > 1 {
        bail!("more than one root realm found");
    }
    debug!("Successfully tested database connection with test query");

    Ok(pool)
}
