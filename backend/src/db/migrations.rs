use chrono::{DateTime, Utc, offset::TimeZone};
use deadpool_postgres::Transaction;
use once_cell::sync::Lazy;
use std::{collections::BTreeMap, time::Duration, num::NonZeroU64};
use tokio_postgres::{IsolationLevel, error::SqlState};

use crate::{prelude::*, db::util::select};
use super::Db;


/// Describes the actions needed to bring the database into a state that we
/// expect.
pub(crate) enum MigrationPlan {
    /// The database is completely empty: we need to create the meta table and
    /// apply all migrations.
    EmptyDb,

    /// The database is completely up to date and all migrations match.
    UpToDate,

    /// The DB can be migrated to the state we expect by applying that many new
    /// migrations.
    Migrate {
        new_migrations: NonZeroU64,
    },
}

impl MigrationPlan {
    /// Builds a migration plan by querying the current state of the DB. If the
    /// DB is in a state that we cannot fix, `Err` is returned. Does not modify
    /// the DB.
    pub(crate) async fn build(tx: &Transaction<'_>) -> Result<Self> {
        // Create the meta table `__db_migrations` if it doesn't exist yet.
        if !super::query::does_table_exist(&**tx, "__db_migrations").await? {
            // Check if there are any other tables in the database, which would be fishy.
            let tables = super::query::all_table_names(&**tx).await?;
            if !tables.is_empty() {
                bail!(
                    "migration table '__db_migrations' does not exist, but some other \
                        tables ({}) do exist. This should not happen.",
                    tables.join(", "),
                );
            }

            return Ok(Self::EmptyDb)
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
        let (selection, mapping) = select!(id, name, applied_on, script);
        let query = format!("select {selection} from __db_migrations");
        let active_migrations = tx
            .query_raw(&query, dbargs![])
            .await
            .context("failed to query meta migrations table")?
            .map_ok(|row| (
                mapping.id.of::<i64>(&row) as u64,
                RawMigration {
                    name: mapping.name.of(&row),
                    applied_on: Utc.from_utc_datetime(&mapping.applied_on.of(&row)),
                    script: mapping.script.of(&row),
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

        // We already know that `MIGRATIONS` contains at least as many elements
        // as `active_migrations`, therefore we can subtract here.
        match NonZeroU64::new(MIGRATIONS.len() as u64 - active_migrations.len() as u64) {
            None => Ok(Self::UpToDate),
            Some(new_migrations) => Ok(Self::Migrate { new_migrations }),
        }
    }

    /// Executes this plan on the database, bringing it into the state we expect.
    pub(crate) async fn execute(&self, tx: &Transaction<'_>) -> Result<()> {
        let new_migrations = match self {
            Self::UpToDate => {
                info!("All migrations are already applied: database schema is up to date.");
                return Ok(());
            }
            Self::EmptyDb => {
                info!("Database is empty. Creating table '__db_migrations'...");
                tx.batch_execute(include_str!("db-migrations.sql"))
                    .await
                    .context("could not create migrations meta table")?;
                MIGRATIONS.len() as u64
            }
            Self::Migrate { new_migrations } => {
                debug!("Table '__db_migrations' already exists");
                new_migrations.get()
            }
        };

        // Apply missing migrations in order.
        info!("The database is missing {new_migrations} migrations. Applying them now.");
        for (id, migration) in MIGRATIONS.range(MIGRATIONS.len() as u64 - new_migrations + 1..) {
            debug!("Applying migration '{}-{}' ...", id, migration.name);
            trace!("Executing:\n{}", migration.script);

            tx.batch_execute(migration.script)
                .await
                .context(format!("failed to run script for '{}-{}'", id, migration.name))?;

            let query = "insert into __db_migrations (id, name, applied_on, script) \
                values ($1, $2, now() at time zone 'utc', $3)";
            tx.execute(query, &[&(*id as i64), &migration.name, &migration.script])
                .await
                .context("failed to update __db_migrations")?;
        }

        info!("Applied {new_migrations} migrations. DB is up to date now.");

        Ok(())
    }
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

        let plan = MigrationPlan::build(&tx).await?;
        plan.execute(&tx).await?;

        match tx.commit().await {
            Ok(_) => return Ok(()),

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
                    script: include_str!(
                        concat!("migrations/", stringify!($id), "-", $name, ".sql")
                    ),
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
    01: "xtea",
    02: "id-generation",
    03: "realms",
    04: "series",
    05: "events",
    06: "blocks",
    07: "sync-status",
    08: "user-sessions",
    09: "search-index-queue",
    10: "search-views",
];
