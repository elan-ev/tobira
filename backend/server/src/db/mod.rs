//! Database related things.

use chrono::NaiveDateTime;
use deadpool_postgres::{Config as PoolConfig, Pool};
use futures::TryStreamExt;
use once_cell::sync::Lazy;
use secrecy::ExposeSecret;
use std::collections::BTreeMap;
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

/// Makes sure the database schema is up to date by checking the active
/// migrations and applying all missing ones.
///
/// If anything unexpected is noticed, an error is returned to notify the user
/// they have to manually deal with it.
pub async fn migrate(db: &mut Db) -> Result<()> {
    // Create the meta table `__db_migrations` if it doesn't exist yet.
    if !query::does_table_exist(db, "__db_migrations").await? {
        // Check if there are any other tables in the database, which would be fishy.
        let tables = query::all_table_names(db).await?;
        if !tables.is_empty() {
            bail!(
                "migration table '__db_migrations' does not exist, but some other tables ({}) \
                    do exist. This should not happen.",
                tables.join(", "),
            );
        }

        info!("Database is empty. Creating table '__db_migrations'...");
        db.batch_execute(include_str!("db-migrations.sql"))
            .await
            .context("could not create migrations meta table")?;
    } else {
        debug!("Table '__db_migrations' already exists");
    }


    /// The migration data from the DB.
    #[derive(Debug)]
    struct RawMigration {
        name: String,
        applied_on: NaiveDateTime,
        script: String,
    }

    debug!("Checking DB migrations");

    // Retrieve all active migrations from the DB.
    let active_migrations = db.query_raw(
            "select id, name, applied_on, script from __db_migrations",
            std::iter::empty(),
        )
        .await?
        .map_ok(|row| (
            row.get::<_, i64>(0) as u64,
            RawMigration {
                name: row.get(1),
                applied_on: row.get(2),
                script: row.get(3),
            }
        ))
        .try_collect::<BTreeMap<_, _>>()
        .await?;


    // Make sure the IDs are consecutive
    if !active_migrations.keys().copied().eq(1..active_migrations.len() as u64 + 1) {
        bail!(
            "The IDs of the active migrations are not consecutive. That is unexpected."
        );
    }

    // Make sure existing migration match the ones we know about.
    for (id, actual_migration) in &active_migrations {
        let expected_migration = MIGRATIONS.get(id).ok_or_else(|| anyhow!(
            "The migration '{}-{}' is active in the database (applied on {}), but no \
                such migration is known to this Tobira application. This is unexpected.",
            id,
            actual_migration.name,
            actual_migration.applied_on,
        ))?;

        if actual_migration.script != expected_migration.script {
            debug!(
                "Expected script for '{}-{}':\n{}",
                id,
                expected_migration.name,
                expected_migration.script,
            );
            debug!(
                "Actual (in database) script for '{}-{}':\n{}",
                id,
                actual_migration.name,
                actual_migration.script,
            );

            bail!(
                "The script of active migration '{}-{}' (applied on {}) does not match the \
                    expected script for that migration. This is unexpected.",
                id,
                actual_migration.name,
                actual_migration.applied_on,
            );
        }
    }


    // Apply missing migrations in order. We already know that `MIGRATIONS` and
    // `active_migrations` have consecutive IDs, so we can simply iterate over
    // this range. We already know that `MIGRATIONS` contains at least as many
    // elements as `active_migrations`.
    if MIGRATIONS.len() == active_migrations.len() {
        info!("All migrations are already applied: database schema is up to date.")
    } else {
        info!("The database is missing some migrations. Applying them now.");
        for (id, migration) in MIGRATIONS.range(active_migrations.len() as u64 + 1..) {
            debug!("Applying migration '{}-{}' ...", id, migration.name);
            trace!("Executing:\n{}", migration.script);

            let transaction = db.transaction().await?;
            transaction.batch_execute(migration.script)
                .await
                .context(format!("failed to run script for '{}-{}'", id, migration.name))?;

            let query = "insert into __db_migrations (id, name, applied_on, script) \
                values ($1, $2, now(), $3)";
            // let params = ;
            transaction.execute(query, &[&(*id as i64), &migration.name, &migration.script])
                .await
                .context("failed to update __db_migrations")?;

            transaction.commit()
                .await
                .context(format!("failed to apply migration '{}-{}'", id, migration.name))?;
        }

        info!(
            "Applied {} migrations. DB is up to date now.",
            MIGRATIONS.len() - active_migrations.len(),
        );
    }

    Ok(())
}

// Helper macro to include migrations in the `migations` folder and add them to
// a map. The `assert!` and `panic!` in there should ideally be compile errors,
// but panics are fine for now.
macro_rules! include_migrations {
    ( $( $id:literal : $name:literal ,)+ ) => {
        Lazy::new(|| {
            let mut m = BTreeMap::new();
            $(
                let prev = m.insert($id, Migration {
                    name: $name,
                    script: include_str!(concat!("migrations/", $id, "-", $name, ".sql")),
                });

                assert!(prev.is_none(), "duplicate key in `include_migrations!`");
            )+

            if !m.keys().copied().eq(1..m.len() as u64 + 1) {
                panic!("migration IDs in `include_migrations!` are not consecutive");
            }

            m
        })

    };
}

#[derive(Debug)]
struct Migration {
    name: &'static str,
    script: &'static str,
}

static MIGRATIONS: Lazy<BTreeMap<u64, Migration>> = include_migrations![
    1: "realms",
];
