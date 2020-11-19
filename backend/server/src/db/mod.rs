//! Database related things.

use deadpool_postgres::{Config as PoolConfig, Pool};
use secrecy::ExposeSecret;
use tokio_postgres::NoTls;

use tobira_util::prelude::*;
use crate::config;

pub(crate) mod cmd;
mod query;


/// Convenience type alias. Every function who needs to operate on the database
/// can just accept a `db: &Db` parameter.
type Db = deadpool_postgres::ClientWrapper;


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
    let client = pool.get().await
        .context("failed to get DB connection")?;
    client.execute("SELECT 1", &[]).await
        .context("failed to execute DB test query")?;
    // let n_roots = connection.execute("SELECT * from realms where id = 0", &[]).await
    //     .context("failed to check")?;
    // if n_roots < 1 {
    //     bail!("no root realm found");
    // } else if n_roots > 1 {
    //     bail!("more than one root realm found");
    // }
    debug!("Successfully tested database connection with test query");

    Ok(pool)
}

/// Drops all tables specified in `table_names`.
async fn drop_tables(db: &Db, table_names: &[String]) -> Result<()> {
    // Oof, so I somehow haven't found a good way to drop a table with a dynamic
    // name. `drop table $1` does not work. So the solution now is just to
    // require very simple table name which don't require escaping and then,
    // dare I say it, doing string concatination to build the query. I don't see
    // a way how this could lead to SQL injections.
    for name in table_names {
        if !name.chars().all(|c| c.is_ascii_alphabetic() || c == '_') {
            bail!("cannot automatically drop table '{}' as it contains forbidden chars", name);
        }

        db.execute(&*format!("drop table {}", name), &[])
            .await
            .context(format!("failed to drop table '{}'", name))?;

        info!("Dropped table '{}'", name);
    }

    Ok(())
}
