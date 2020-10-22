//! Database related things.

use anyhow::{Context, Result};
use deadpool_postgres::{Config as PoolConfig, Pool};
use log::{debug, info, trace};
use tokio_postgres::NoTls;

use crate::config;


/// Creates a new database connection pool.
pub async fn create_pool(config: &config::Db) -> Result<Pool> {
    let pool_config = PoolConfig {
        user: Some(config.user().into()),
        password: Some(config.password().into()),
        host: Some(config.host().into()),
        port: Some(config.port),
        dbname: Some(config.database.clone()),
        .. PoolConfig::default()
    };

    trace!("Database configuration: {:#?}", pool_config);

    debug!(
        "Connecting to postgresql://{}:*****@{}:{}/{}",
        config.user(),
        config.host(),
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

    // ensure database version exists
    info!("Creating table version");
    connection.execute(
        "create table if not exists version (version int not null)", &[]).await
        .context("failed to schema for table 'realms'")?;
    let n_version = connection.execute("SELECT * from version limit 1", &[]).await
        .context("failed to check")?;
    if n_version < 1 {
        info!("Setting database version");
        connection.execute("insert into version (version) values (0)", &[]).await
            .context("failed to set database version")?;
    }

    // ensure table realms exist
    info!("Creating table realms");
    connection.execute("\
        create table if not exists realms (\
            id int generated always as identity (start with 0 minvalue 0) primary key,\
            parent int not null references realms on delete restrict,\
            name text not null\
        )", &[]).await
        .context("failed to schema for table 'realms'")?;
    let n_roots = connection.execute("SELECT count(*) from realms where id = 0", &[]).await
        .context("failed to check")?;
    if n_roots < 1 {
        info!("Inserting root realm");
        connection.execute("insert into realms (name, parent) values ('root', 0)", &[]).await
            .context("failed insert root realm")?;
    }
    debug!("Successfully tested database connection with test query");

    Ok(pool)
}
