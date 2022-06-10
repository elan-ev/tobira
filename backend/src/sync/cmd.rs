use structopt::StructOpt;

use crate::{
    config::Config,
    prelude::*, db::DbConnection,
};


#[derive(Debug, StructOpt)]
pub(crate) struct Args {
    /// If specified, the command will run forever listening for new data.
    #[structopt(long)]
    daemon: bool,

    #[structopt(subcommand)]
    cmd: Option<SyncCommand>,
}

#[derive(Debug, StructOpt)]
pub(crate) enum SyncCommand {
    /// Resets the "harvested until" timestamp, causing all data to be
    /// re-synchronized when the sync process is next started. Does *not*
    /// delete any data from the DB.
    Reset,
}

/// Entry point for `search-index` commands.
pub(crate) async fn run(args: &Args, config: &Config) -> Result<()> {
    info!("Starting Tobira <-> Opencast synchronization ...");
    trace!("Configuration: {:#?}", config);

    let db = crate::connect_and_migrate_db(config).await?;
    let conn = db.get().await?;

    match args.cmd {
        None => super::run(args.daemon, conn, config).await,
        Some(SyncCommand::Reset) => reset(conn).await,
    }
}

async fn reset(db: DbConnection) -> Result<()> {
    bunt::println!(
        "\n{$bold+red+intense}Are you sure you want to reset the sync status?{/$}\n\
            That will cause all items to be resynced, which could take a long time \
            and puts some stress on your Opencast server.\n\
            \n\
            Type 'yes' to reset the sync status."
    );
    crate::cmd::prompt_for_yes()?;

    db.execute(
        "update sync_status set harvested_until = (timestamp '1970-01-01 00:00:00')",
        &dbargs![],
    ).await?;
    info!("Sync status was reset -> all Opencast items will be resynced");

    Ok(())
}
