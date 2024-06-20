use std::time::Instant;

use crate::{
    config::Config,
    prelude::*, db::DbConnection,
};


#[derive(Debug, clap::Args)]
pub(crate) struct Args {
    #[clap(subcommand)]
    cmd: SyncCommand,
}

#[derive(Debug, clap::Subcommand)]
pub(crate) enum SyncCommand {
    /// Synchronizes Tobira with the configured Opencast instance by talking to
    /// the harvest API.
    Run {
        /// If specified, the command will run forever listening for new data.
        /// Otherwise it will stop as soon as Opencast says "no new items".
        #[clap(long)]
        daemon: bool,
    },

    /// Resets the "harvested until" timestamp, causing all data to be
    /// re-synchronized when the sync process is next started. Does *not*
    /// delete any data from the DB.
    Reset {
        /// If specified, skips the "Are you sure?" question.
        #[clap(long)]
        yes_absolutely_reset: bool,
    },

    /// Commands related to fetching texts like subtitles and slide
    /// transcriptions from Opencast.
    Texts {
        #[clap(subcommand)]
        cmd: TextsCommand,
    },
}

#[derive(Debug, clap::Subcommand)]
pub(crate) enum TextsCommand {
    /// Fetches text attachments for events that have been enqueued.
    Fetch {
        /// If specified, the command will run forever and not stop after the
        /// clear has been cleared.
        #[clap(long)]
        daemon: bool,
    },
}

impl Args {
    pub(crate) fn is_long_running(&self) -> bool {
        match self.cmd {
            SyncCommand::Run { daemon } => daemon,
            SyncCommand::Texts { cmd: TextsCommand::Fetch { daemon }} => daemon,
            _ => false,
        }
    }
}

/// Entry point for `search-index` commands.
pub(crate) async fn run(args: &Args, config: &Config) -> Result<()> {
    trace!("Configuration: {:#?}", config);

    let db = crate::connect_and_migrate_db(config).await?;
    let conn = db.get().await?;

    match args.cmd {
        SyncCommand::Run { daemon } => {
            info!("Starting Tobira <-> Opencast synchronization ...");
            let before = Instant::now();
            super::run(daemon, conn, config).await?;
            info!("Finished harvest in {:.2?}", before.elapsed());
            Ok(())
        }
        SyncCommand::Reset { yes_absolutely_reset: yes } => reset(conn, yes).await,
        SyncCommand::Texts { cmd: TextsCommand::Fetch { daemon } } => {
            super::text::fetch_update(conn, config, daemon).await
        }
    }
}

async fn reset(db: DbConnection, yes: bool) -> Result<()> {
    if !yes {
        bunt::println!(
            "\n{$bold+red+intense}Are you sure you want to reset the sync status?{/$}\n\
                That will cause all items to be resynced, which could take a long time \
                and puts stress on your Opencast server.\n\
                \n\
                Type 'yes' to reset the sync status."
        );
        crate::cmd::prompt_for_yes()?;
    }

    db.execute(
        "update sync_status set harvested_until = (timestamp '1970-01-01 00:00:00')",
        &dbargs![],
    ).await?;
    info!("Sync status was reset -> all Opencast items will be resynced");

    Ok(())
}
