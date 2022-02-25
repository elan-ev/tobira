//! Database related things.

use deadpool_postgres::{Config as PoolConfig, Pool, Runtime};
use secrecy::{ExposeSecret, Secret};
use std::time::{Duration, Instant};
use tokio_postgres::NoTls;

use crate::{http::{self, Response}, prelude::*};


pub(crate) mod cmd;
mod migrations;
mod query;
mod tx;
pub(crate) mod types;
pub(crate) mod util;

pub use self::{
    tx::Transaction,
    migrations::migrate,
};


#[derive(Debug, confique::Config)]
pub(crate) struct DbConfig {
    /// The username of the database user.
    #[config(default = "tobira")]
    user: String,

    /// The password of the database user.
    password: Secret<String>,

    /// The host the database server is running on.
    #[config(default = "127.0.0.1")]
    host: String,

    /// The port the database server is listening on. (Just useful if your
    /// database server is not running on the default PostgreSQL port).
    #[config(default = 5432)]
    port: u16,

    /// The name of the database to use.
    #[config(default = "tobira")]
    database: String,
}


/// Convenience type alias. Every function that needs to operate on the database
/// can just accept a `db: &Db` parameter.
pub(crate) type Db = deadpool_postgres::ClientWrapper;

/// Type alias for an owned DB connection.
pub(crate) type DbConnection = deadpool::managed::Object<deadpool_postgres::Manager>;


/// Creates a new database connection pool.
pub(crate) async fn create_pool(config: &DbConfig) -> Result<Pool> {
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

    let pool = pool_config.create_pool(Some(Runtime::Tokio1), NoTls)?;
    info!("Created database pool");

    // Test the connection by executing a simple query.
    let client = pool.get().await
        .context("failed to get DB connection")?;
    client.execute("select 1", &[]).await
        .context("failed to execute DB test query")?;
    debug!("Successfully tested database connection with test query");

    // Make sure the database uses UTF8 encoding. There is no good reason to use
    // anything else.
    let encoding = client.query_one("show server_encoding;", &[]).await
        .context("failed to check server encoding")?
        .get::<_, String>(0);

    if encoding != "UTF8" {
        bail!("Database encoding is not UTF8, but Tobira requires UTF8!");
    }

    Ok(pool)
}

/// Checks out one DB connection from the pool or returns `Err` with a "service
/// unavailable" response.
pub(crate) async fn get_conn_or_service_unavailable(pool: &Pool) -> Result<DbConnection, Response> {
    let before = Instant::now();
    let connection = pool.get().await.map_err(|e| {
        error!("Failed to obtain DB connection for API request: {}", e);
        http::response::service_unavailable()
    })?;

    let acquire_conn_time = before.elapsed();
    if acquire_conn_time > Duration::from_millis(5) {
        warn!("Acquiring DB connection from pool took {:.2?}", acquire_conn_time);
    }

    Ok(connection)
}
