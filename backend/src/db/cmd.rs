use std::{
    io,
    os::unix::process::CommandExt,
    path::{Path, PathBuf},
    process::Command,
};
use tokio_postgres::IsolationLevel;

use secrecy::ExposeSecret;

use crate::{prelude::*, util::Never, config::Config};
use super::{Db, DbConfig, create_pool, query};


#[derive(Debug, clap::Subcommand)]
pub(crate) enum DbCommand {
    /// Removes all data and tables from the database. Also clears search index.
    Clear,

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

    /// Equivalent to `db clear` followed by `db migrate`.
    Reset,
}

/// Entry point for `db` commands.
pub(crate) async fn run(cmd: &DbCommand, config: &Config) -> Result<()> {
    if let DbCommand::Console = cmd {
        return console(&config.db).map(|_| ());
    }

    // Connect to database
    let pool = create_pool(&config.db).await?;
    let mut db = pool.get().await?;

    // Dispatch command
    match cmd {
        DbCommand::Clear => clear(&mut db, config).await?,
        DbCommand::Migrate => super::migrate(&mut db).await?,
        DbCommand::Reset => {
            clear(&mut db, config).await?;
            super::migrate(&mut db).await?;
        }
        DbCommand::Script { script } => run_script(&db, &script).await?,
        DbCommand::Console => unreachable!("already handled above"),
    }

    Ok(())
}


/// Clears the whole database by removing and re-creating the `public` schema.
///
/// This also has a interactive check, asking the user to confirm the removal.
/// If the user did not confirm and the database is not changed, `false` is
/// returned; `true` otherwise.
async fn clear(db: &mut Db, config: &Config) -> Result<()> {
    let tx = db.build_transaction()
        .isolation_level(IsolationLevel::Serializable)
        .start()
        .await?;

    log::warn!("You are about to delete all existing data, tables, types and everything in \
        the 'public' schema of the database!");

    // Print some data about this machine and the database
    println!();
    if let Ok(Ok(hostname)) = hostname::get().map(|n| n.into_string()) {
        println!("Hostname: {}", hostname);
    }
    println!("Database host: {}", config.db.host);
    println!("Database name: {}", config.db.database);

    println!();
    println!("The database currently holds these tables:");
    let tables = query::all_table_names(&*tx).await?;
    for name in &tables {
        let num_rows = tx.query_one(&*format!("select count(*) from {}", name), &[])
            .await?
            .get::<_, i64>(0);
        println!(" - {} ({} rows)", name, num_rows);
    }

    println!();
    println!("Are you sure you want to completely remove everything in this database \
        and clear the search index? \
        This completely drops the 'public' schema. \
        Please double-check the server you are running this on!\n\
        Type 'yes' to proceed to delete the data.");
    crate::cmd::prompt_for_yes()?;

    // We clear everything by dropping the 'public' schema. This is suggested
    // here, for example: https://stackoverflow.com/a/21247009/2408867
    tx.execute("drop schema public cascade", &[]).await?;
    tx.execute("create schema public", &[]).await?;
    tx.execute(&*format!("grant all on schema public to {}", config.db.user), &[]).await?;
    tx.execute("grant all on schema public to public", &[]).await?;
    tx.execute("comment on schema public is 'standard public schema'", &[]).await?;
    tx.commit().await.context("failed to commit clear transaction")?;

    info!("Dropped and recreated schema 'public'");

    let meili = config.meili.connect_only().await?;
    crate::search::clear(meili).await?;

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
    let connection_uri = format!(
        "postgresql://{}:{}@{}:{}/{}",
        config.user,
        config.password.expose_secret(),
        config.host,
        config.port,
        config.database,
    );
    let error = Command::new("psql").arg(connection_uri).exec();
    let message = match error.kind() {
        io::ErrorKind::NotFound => "`psql` was not found in your `PATH`",
        io::ErrorKind::PermissionDenied => "you don't have sufficient permissions to execute `psql`",
        _ => "an error occured while trying to execute `psql`",
    };
    Err(error).context(message)
}
