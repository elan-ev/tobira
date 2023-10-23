use std::{
    io,
    os::unix::process::CommandExt,
    path::{Path, PathBuf},
    process::Command,
};
use deadpool_postgres::Transaction;
use tokio_postgres::IsolationLevel;

use secrecy::ExposeSecret;

use crate::{prelude::*, util::Never, config::Config, search::writer::MeiliWriter};
use super::{Db, DbConfig, create_pool, query, migrations::unsafe_overwrite_migrations};


#[derive(Debug, clap::Subcommand)]
pub(crate) enum DbCommand {
    /// Removes all data and tables from the database. Also clears search index.
    Clear {
        #[clap(flatten)]
        options: ClearOptions,
    },

    /// Runs an `.sql` script with the configured database connection.
    Script {
        /// Path to a file containing an SQL script.
        script: PathBuf,
    },

    /// Runs the database migrations that also automatically run when starting
    /// the server.
    Migrate,

    /// Connects to the database and gives you an SQL prompt.
    /// This just starts the `psql` client, so make sure that is installed
    /// and accessible in your `PATH`.
    Console,

    /// Dumps the current state of the database for later restoration
    /// with the `db restore` command.
    ///
    /// Internally this uses your local copy of `pg_dump`, so make sure
    /// that is compatible with your database!
    ///
    /// This can be used while Tobira is running and reading/writing the database,
    /// and will still yield consistent results!
    Dump {
        path: PathBuf,
    },

    /// Restore Tobira's database from a dump created by the `db dump` command.
    ///
    /// Internally this uses your lcoal copy of `pg_restore`, so make sure
    /// that is compatible with your database and the version of `pg_dump`
    /// that created the dump! (See `db dump`.)
    ///
    /// Note that this will drop the entire Tobira database before restoring.
    /// Specifically that means you will lose data if the restoration fails!
    /// It also means that it can't be run while there are connections to the DB,
    /// e.g. when Tobira is running.
    Restore {
        dump: PathBuf,
    },

    /// Equivalent to `db clear` followed by `db migrate`.
    Reset {
        #[clap(flatten)]
        clear: ClearOptions,
    },

    /// Updates the migrations scripts in the table `__db_migrations` to match
    /// the ones expected by this Tobira binary. Does not add new entries to
    /// the table, but might delete unknown migrations. This is intended for
    /// developers only, do not use if you don't know what you're doing!
    UnsafeOverwriteMigrations,
}

#[derive(Debug, clap::Args)]
pub(crate) struct ClearOptions {
    /// If specified, skips the "Are you sure?" question.
    #[clap(long)]
    pub(crate) yes_absolutely_clear_db: bool,
}

/// Entry point for `db` commands.
pub(crate) async fn run(cmd: &DbCommand, config: &Config) -> Result<()> {
    // Some subcommands fork out to other processes that establish their own connection
    match cmd {
        DbCommand::Console => { return console(&config.db).map(|_| ()); },
        DbCommand::Dump { path } => { return dump(&config.db, path).map(|_| ()); },
        DbCommand::Restore { dump } => { return restore(&config.db, dump).map(|_| ()); },
        _ => {},
    }

    // Connect to database
    let pool = create_pool(&config.db).await?;
    let mut db = pool.get().await?;

    // Dispatch command
    match cmd {
        DbCommand::Clear { options: ClearOptions { yes_absolutely_clear_db: yes } }
            => clear(&mut db, config, *yes).await?,
        DbCommand::Migrate => super::migrate(&mut db).await?,
        DbCommand::Reset { clear: ClearOptions { yes_absolutely_clear_db: yes } } => {
            clear(&mut db, config, *yes).await?;
            super::migrate(&mut db).await?;
        }
        DbCommand::Script { script } => run_script(&db, &script).await?,
        DbCommand::Console | DbCommand::Dump { .. } | DbCommand::Restore { .. } => {
            unreachable!("already handled above");
        },
        DbCommand::UnsafeOverwriteMigrations => unsafe_overwrite_migrations(&mut db).await?,
    }

    Ok(())
}


/// Clears the whole database by removing and re-creating the `public` schema.
///
/// This also has a interactive check, asking the user to confirm the removal.
/// If the user did not confirm and the database is not changed, `false` is
/// returned; `true` otherwise.
async fn clear(db: &mut Db, config: &Config, yes: bool) -> Result<()> {
    let tx = db.build_transaction()
        .isolation_level(IsolationLevel::Serializable)
        .start()
        .await?;


    // ### Step 1: Collect objects that we want to drop ###
    let schema: String = tx.query_one("select current_schema()", &[])
        .await
        .context("failed to query current schema")?
        .get(0);

    async fn query_strings(tx: &Transaction<'_>, sql: &str) -> Result<Vec<String>> {
        tx.query_raw(sql, dbargs![])
            .await?
            .map_ok(|row| row.get(0))
            .try_collect::<Vec<_>>()
            .await?
            .pipe(Ok)
    }

    // List all functions in this schema that are not part of an extension
    // (like pgcrypto). The function name alone is not enough for `drop
    // function` as there might be multiple overloads.
    let sql = "\
        select pg_proc.oid::regprocedure::text \
        from pg_proc
        left join pg_depend on pg_depend.objid = pg_proc.oid and pg_depend.deptype = 'e'
        where
            pronamespace = current_schema()::regnamespace
            and pg_depend.objid is null";
    let functions = query_strings(&tx, sql).await.context("failed to query all functions")?;

    // Sequences
    let sql = "SELECT sequence_name FROM information_schema.sequences";
    let sequences = query_strings(&tx, sql).await.context("failed to query all sequences")?;

    // We query `pg_depend` and filter out all types that depend on something
    // else via internal (i) or extension (e) dependency. The internal
    // dependencies are dropped automatically by other drops (this is mostly
    // about table types). The extension dependencies mean that this type
    // belong to an extension (e.g. ghstore belongs to hstore); and we don't
    // want to delete those.
    let sql = "\
        select typname \
        from pg_type \
        where typnamespace = current_schema()::regnamespace \
        and not exists(\
            select from pg_depend \
            where pg_depend.objid = pg_type.oid \
            and (pg_depend.deptype = 'i' or pg_depend.deptype = 'e') \
        )";
    let types = query_strings(&tx, sql).await.context("failed to query all types")?;

    // Tables
    let tables = query::all_table_names(&*tx).await.context("failed to query all tables")?;


    // ### Step 2: Ask the user to confirm ###
    println!();
    println!(
        "You are about to irrecoverably delete all existing data, tables, types, \n\
        functions and everything else in the current schema of the database! \n\
        The search index is cleared as well.",
    );

    // Print some data about this machine and the database
    println!();
    if let Ok(Ok(hostname)) = hostname::get().map(|n| n.into_string()) {
        bunt::println!("Hostname: {[yellow+bold+intense]}", hostname);
    }
    bunt::println!("Database host: {[yellow+bold+intense]}", config.db.host);
    bunt::println!("Database name: {[yellow+bold+intense]}", config.db.database);
    bunt::println!("Schema: {[yellow+bold+intense]}", schema);

    println!();
    println!("Tables to be deleted:");
    for name in &tables {
        let num_rows = tx.query_one(&*format!("select count(*) from {}", name), &[])
            .await?
            .get::<_, i64>(0);
        bunt::println!(" - {} ({[blue+intense]} rows)", name, num_rows);
    }

    if !yes {
        if !cfg!(debug_assertions) {
            println!();
            println!("⚠️ ⚠️ ⚠️");
            bunt::println!("{$red+bold+intense}This is a production build of Tobira, \
                indicating that you are likely executing this on a production system.{/$}");
            println!("⚠️ ⚠️ ⚠️");
        }
        println!();
        println!("Are you sure you want to irrecoverably remove everything mentioned above? \n\
            Type 'yes' to confirm.");
        crate::cmd::prompt_for_yes()?;
    }


    // ### Step 3: Actually delete everything ###

    // We delete tables with 'cascade' first. This automatically also removes
    // their triggers, constraints, indexes, and also some trigger functions
    // and all views dependent on them.
    for table in tables {
        tx.execute(&format!("drop table if exists {table} cascade"), &[]).await?;
        trace!("Dropped table {table}");
    }

    // Next we drop all sequences as this also removes their built-in types.
    for sequence in sequences {
        tx.execute(&format!("drop sequence if exists {sequence}"), &[]).await?;
        trace!("Dropped sequence {sequence}");
    }

    // Finally, we drop all functions.
    for function in functions {
        tx.execute(&format!("drop function if exists {function} cascade"), &[]).await?;
        trace!("Dropped function {function}");
    }

    // Next we drop all types.
    for ty in types {
        tx.execute(&format!("drop type if exists {ty}"), &[]).await?;
        trace!("Dropped type {ty}");
    }

    tx.commit().await.context("failed to commit clear transaction")?;
    info!("Dropped everything inside schema '{schema}' of the database");


    // ### Step 4: Also clear the search index ###
    let meili = config.meili.connect().await?;
    // We can't lock the table that we just destroyed, but this is fine, since clearing
    // the search index is something that shouldn't happen in parallel to other things anyway.
    crate::search::clear(&MeiliWriter::without_lock(&meili))
        .await
        .context("failed to clear search index")?;
    info!("Cleared search index");

    Ok(())
}

async fn run_script(db: &Db, script_path: &Path) -> Result<()> {
    let script = tokio::fs::read_to_string(script_path)
        .await
        .context(format!("failed to read script file '{}'", script_path.display()))?;

    db.batch_execute(&script).await.context("failed to execute script")?;
    info!("Successfully ran SQL script");

    Ok(())
}

fn console(config: &DbConfig) -> Result<Never> {
    fork_command(
        Command::new("psql")
            .arg(connection_uri(config))
    )
}

fn dump(config: &DbConfig, path: &Path) -> Result<Never> {
    fork_command(
        Command::new("pg_dump")
            .arg("--dbname")
            .arg(connection_uri(config))
            .arg("--format")
            .arg("custom")
            .arg("--file")
            .arg(path)
    )
}

fn restore(config: &DbConfig, dump: &Path) -> Result<Never> {
    fork_command(
        Command::new("pg_restore")
            .arg("--dbname")
            .arg(connection_uri(&DbConfig { database: "postgres".into(), ..config.clone() }))
            .arg("--clean")
            .arg("--if-exists")
            .arg("--create")
            .arg(dump)
    )
}

fn fork_command(command: &mut Command) -> Result<Never> {
    let error = command.exec();
    let program = command.get_program().to_string_lossy();
    let message = match error.kind() {
        io::ErrorKind::NotFound => format!("`{program}` was not found in your `PATH`"),
        io::ErrorKind::PermissionDenied => format!("you don't have sufficient permissions to execute `{program}`"),
        _ => format!("an error occured while trying to execute `{program}`"),
    };
    Err(error).context(message)
}

fn connection_uri(config: &DbConfig) -> String {
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
    let encode = |s| utf8_percent_encode(s, NON_ALPHANUMERIC);

    format!(
        "postgresql://{}:{}@{}:{}/{}",
        encode(&config.user),
        encode(&config.password.expose_secret()),
        config.host,
        config.port,
        encode(&config.database),
    )
}
