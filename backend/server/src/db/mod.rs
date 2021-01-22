//! Database related things.

use chrono::{DateTime, Utc, offset::TimeZone};
use deadpool_postgres::{Config as PoolConfig, Pool};
use futures::TryStreamExt;
use once_cell::sync::Lazy;
use secrecy::ExposeSecret;
use std::{collections::BTreeMap, time::Duration};
use tokio_postgres::{NoTls, IsolationLevel, error::SqlState};

use tobira_util::prelude::*;
use crate::config;

pub(crate) mod cmd;
mod query;


/// Convenience type alias. Every function that needs to operate on the database
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

    debug!("Successfully tested database connection with test query");

    Ok(pool)
}

/// Makes sure the database schema is up to date by checking the active
/// migrations and applying all missing ones.
///
/// If anything unexpected is noticed, an error is returned to notify the user
/// they have to manually deal with it.
pub async fn migrate(db: &mut Db) -> Result<()> {
    // The whole migration process is wrapped in one serializable transaction.
    // This guarantees that only one Tobira node ever does the migrations. As
    // this only happens during startup, the potential slow down from such a
    // strong isolation level is fine.
    //
    // Serializable transactions can fail when committing them. That means we
    // have to wrap everything in a loop and retry. If the transaction ever
    // fails for one Tobira node and that node retries, we _expect_ that in the
    // second loop iteration the node will observe that the `__db_migrations`
    // table already exists as the transaction of another node is expected to
    // have correctly committed by that point.
    loop {
        let tx = db.build_transaction()
            .isolation_level(IsolationLevel::Serializable)
            .start()
            .await?;

        // Create the meta table `__db_migrations` if it doesn't exist yet.
        if !query::does_table_exist(&*tx, "__db_migrations").await? {
            // Check if there are any other tables in the database, which would be fishy.
            let tables = query::all_table_names(&*tx).await?;
            if !tables.is_empty() {
                bail!(
                    "migration table '__db_migrations' does not exist, but some other \
                        tables ({}) do exist. This should not happen.",
                    tables.join(", "),
                );
            }

            info!("Database is empty. Creating table '__db_migrations'...");
            tx.batch_execute(include_str!("db-migrations.sql"))
                .await
                .context("could not create migrations meta table")?;
        } else {
            debug!("Table '__db_migrations' already exists");
        }


        /// The migration data from the DB.
        #[derive(Debug)]
        struct RawMigration {
            name: String,
            applied_on: DateTime<Utc>,
            script: String,
        }

        debug!("Checking DB migrations");

        // Retrieve all active migrations from the DB.
        let active_migrations = tx.query_raw(
                "select id, name, applied_on, script from __db_migrations",
                std::iter::empty(),
            )
            .await?
            .map_ok(|row| (
                row.get::<_, i64>(0) as u64,
                RawMigration {
                    name: row.get(1),
                    applied_on: Utc.from_utc_datetime(&row.get(2)),
                    script: row.get(3),
                }
            ))
            .try_collect::<BTreeMap<_, _>>()
            .await?;


        // Make sure the IDs are consecutive
        if !active_migrations.keys().copied().eq(1..active_migrations.len() as u64 + 1) {
            bail!("The IDs of the active migrations are not consecutive. This is unexpected.");
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

                tx.batch_execute(migration.script)
                    .await
                    .context(format!("failed to run script for '{}-{}'", id, migration.name))?;

                let query = "insert into __db_migrations (id, name, applied_on, script) \
                    values ($1, $2, now() at time zone 'utc', $3)";
                // let params = ;
                tx.execute(query, &[&(*id as i64), &migration.name, &migration.script])
                    .await
                    .context("failed to update __db_migrations")?;
            }
        }

        match tx.commit().await {
            Ok(_) => {
                let number_of_executed_migrations = MIGRATIONS.len() - active_migrations.len();
                if number_of_executed_migrations > 0 {
                    info!(
                        "Applied {} migrations. DB is up to date now.",
                        number_of_executed_migrations,
                    );
                }

                return Ok(());
            }

            Err(e) if e.code() == Some(&SqlState::T_R_SERIALIZATION_FAILURE) => {
                let backoff_duration = Duration::from_millis(500);
                warn!(
                    "Database migration transaction failed to commit. This is likely because \
                    of another Tobira node which has executed the same transaction concurrently. \
                    Will try again in {:?}.",
                    backoff_duration,
                );

                tokio::time::sleep(backoff_duration).await;
                continue;
            }

            Err(e) => Err(e)?,
        }
    }
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
    1: "xtea",
    2: "id-generation",
    3: "realms",
    4: "series",
    5: "events",
    6: "blocks",
];
