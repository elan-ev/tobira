//! Database related things.

use anyhow::Result;
use tokio_postgres::NoTls;
use deadpool_postgres::{Config, Pool};


/// Creates a new database connection pool.
pub fn create_pool() -> Result<Pool> {
    // TODO: read config from file
    let config = Config {
        user: Some("postgres".into()),
        password: Some("test".into()),
        host: Some("localhost".into()),
        port: Some(5555),
        dbname: Some("minitest".into()),
        .. Config::default()
    };

    config.create_pool(NoTls)
}
