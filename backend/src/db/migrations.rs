use chrono::{DateTime, Utc, offset::TimeZone};
use once_cell::sync::Lazy;
use std::{collections::BTreeMap, time::Duration};
use tokio_postgres::{IsolationLevel, Transaction, error::SqlState, Client};

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

    /// The DB can be migrated to the state we expect, with `next_migration`
    /// being the migration index that needs to be executed next.
    Migrate {
        next_migration: u64,
    },
}

impl MigrationPlan {
    /// Builds a migration plan by querying the current state of the DB. If the
    /// DB is in a state that we cannot fix, `Err` is returned. Does not modify
    /// the DB.
    pub(crate) async fn build(tx: &Transaction<'_>) -> Result<Self> {
        if !super::query::does_table_exist(&*tx, "__db_migrations").await? {
            // Check if there are any other tables in the database, which would be fishy.
            let tables = super::query::all_table_names(&*tx).await?;
            if !tables.is_empty() {
                bail!(
                    "migration table '__db_migrations' does not exist, but some other \
                        tables ({}) do exist. This should not happen.",
                    tables.join(", "),
                );
            }

            return Ok(Self::EmptyDb)
        }


        /// The migration data from the DB.
        #[derive(Debug)]
        struct RawMigration {
            name: String,
            applied_on: DateTime<Utc>,
            script: String,
        }

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
        if MIGRATIONS.len() == active_migrations.len() {
            Ok(Self::UpToDate)
        } else {
            Ok(Self::Migrate { next_migration: active_migrations.len() as u64 + 1 })
        }
    }

    pub(crate) fn missing_migrations(&self) -> u64 {
        match self {
            MigrationPlan::EmptyDb => MIGRATIONS.len() as u64,
            MigrationPlan::UpToDate => 0,
            MigrationPlan::Migrate { next_migration }
                => MIGRATIONS.len() as u64 - next_migration + 1,
        }
    }

    /// Executes the next migration in this plan on the database. Returns
    /// `done`, i.e. `true` if the DB is up to date after this method call.
    pub(crate) async fn execute_next(&self, tx: &Transaction<'_>) -> Result<bool> {
        let id = match self {
            Self::UpToDate => return Ok(true),
            Self::EmptyDb => {
                create_meta_table_if_missing(tx).await?;
                0
            }
            Self::Migrate { next_migration } => *next_migration,
        };

        // Apply missing migrations in order.
        let migration = &MIGRATIONS[&id];
        debug!("Applying migration '{}-{}' ...", id, migration.name);
        trace!("Executing:\n{}", migration.script);

        tx.batch_execute(migration.script)
            .await
            .context(format!("failed to run script for '{}-{}'", id, migration.name))?;

        let query = "insert into __db_migrations (id, name, applied_on, script) \
            values ($1, $2, now() at time zone 'utc', $3)";
        tx.execute(query, &[&(id as i64), &migration.name, &migration.script])
            .await
            .context("failed to update __db_migrations")?;

        Ok(id == MIGRATIONS.len() as u64)
    }
}

async fn create_meta_table_if_missing(tx: &Transaction<'_>) -> Result<()> {
    trace!("Creating table '__db_migrations' if it does not exist yet...");
    tx.batch_execute(include_str!("db-migrations.sql"))
        .await
        .context("could not create migrations meta table")?;
    Ok(())
}

/// Makes sure the database schema is up to date by checking the active
/// migrations and applying all missing ones.
///
/// If anything unexpected is noticed, an error is returned to notify the user
/// they have to manually deal with it.
pub async fn migrate(db: &mut Client) -> Result<()> {
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
    debug!("Checking DB migrations");
    let mut migrations_executed = 0;
    loop {
        let tx = db.build_transaction()
            .isolation_level(IsolationLevel::Serializable)
            .start()
            .await?;

        // Using transactions is all fine and good (and we should definitely do
        // it), but running two of these migration transactions at the same
        // time can lead to deadlocks. Those stop Tobira. If a systemd now
        // automatically restarts the process, and if we have two services run
        // like that at the same time (very common in practice), then those two
        // services will continue to run into each other with no one ever able
        // to complete the transaction/migration.
        //
        // To prevent that, we acquire an explicit lock at the very start. Only
        // one process can hold that lock so that prevents deadlocks inside the
        // migration.
        //
        // But the table might not even exist yet! That's why we simply create
        // it here. The script already contains `if not exists`, so this is no
        // problem.
        create_meta_table_if_missing(&tx).await?;

        let print_notice = tokio::spawn(async {
            tokio::time::sleep(Duration::from_millis(300)).await;
            debug!("Could not acquire exclusive lock to '__db_migrations' immediately. \
                Likely another process is currently applying migrations. Waiting for lock...");
        });
        trace!("Attempting to lock table '__db_migrations'...");
        let query = "lock table __db_migrations in share update exclusive mode";
        let res = tx.execute(query, &[]).await;
        print_notice.abort();
        res.context("failed to lock table '__db_migrations'")?;
        trace!("Locked table '__db_migrations'");


        // We are now the only process allowed to tinker with migrations. First
        // build a plan of what needs to be done and then execute the next
        // migration. We do one migration at a time so that each migration
        // script runs in its own transaction. Otherwise certain things
        // (like adding a value to an enum) don't work.
        let plan = MigrationPlan::build(&tx).await?;
        if matches!(plan, MigrationPlan::UpToDate) && migrations_executed == 0 {
            info!("All migrations are already applied: database schema is up to date.");
            return Ok(());
        }
        let is_done = plan.execute_next(&tx).await?;


        match tx.commit().await {
            Ok(_) => {
                migrations_executed += 1;
                if is_done {
                    info!("Applied {migrations_executed} migrations. DB is up to date now.");
                    return Ok(());
                }
            },

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

/// Implementation of subcommand with same name, see that for docs.
pub(crate) async fn unsafe_overwrite_migrations(db: &mut Db) -> Result<()> {
    let tx = db.build_transaction()
        .isolation_level(IsolationLevel::Serializable)
        .start()
        .await?;

    let (selection, mapping) = select!(id, name, script);
    let query = format!("select {selection} from __db_migrations");
    let rows = tx.query(&query, &[]).await.context("failed to fetch from __db_migrations")?;

    for row in rows {
        let id: i64 = mapping.id.of(&row);
        let name: String = mapping.name.of(&row);
        let script: String = mapping.script.of(&row);

        if let Some(migration) = MIGRATIONS.get(&(id as u64)) {
            if migration.script != script || migration.name != name {
                tx.execute(
                    "update __db_migrations set name = $1, script = $2 where id = $3",
                    &[&migration.name, &migration.script, &id],
                ).await?;
                info!("Updated name & script for migration {} {}", id as u64, migration.name);
            }
        } else {
            // We don't know about the migration, so we delete it.
            tx.execute("delete from __db_migrations where id = $1", &[&id]).await?;
            info!("Deleted migration {} ({}) as it's unknown", id as u64, name);
        }
    }
    tx.commit().await?;

    Ok(())
}


// Helper macro to include migrations in the `migrations` folder and add them to
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
    07: "realm-names",
    08: "sync-status",
    09: "user-sessions",
    10: "search-index-queue",
    11: "search-views",
    12: "deleted-items",
    13: "series-block-show-metadata",
    14: "event-captions",
    15: "fix-event-constraints",
    16: "master-track",
    17: "improve-ancestor-function-estimate",
    18: "user-realms",
    19: "series-search-view",
    20: "fix-queue-triggers",
    21: "fix-user-root-realm-name-block",
    22: "user-email",
    23: "video-block-show-link",
    24: "known-groups",
    25: "longer-videos",
    26: "more-event-search-data",
    27: "users",
    28: "user-index-queue-triggers",
    29: "extend-series-block",
    30: "realm-permissions",
    31: "series-metadata",
    32: "custom-actions",
    33: "event-slide-text-and-segments",
    34: "event-view-and-deletion-timestamp",
    35: "playlists",
    36: "playlist-blocks",
    37: "redo-search-triggers-and-listed",
    38: "event-texts",
];
