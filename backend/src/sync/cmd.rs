use std::time::Instant;

use chrono::{DateTime, Utc};

use crate::{
    config::Config,
    db::{util::select, DbConnection},
    prelude::*,
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

    Status,
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
        SyncCommand::Texts { cmd: TextsCommand::Status } => text_status(conn).await,
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

macro_rules! info_line {
    ($label:expr, $value:expr) => {
        bunt::println!("{$dimmed}{}:{/$} {[blue+intense]}", $label, $value);
    };
}

const HELPER_QUERIES: &str = "
    events_with_text_assets as (
        select *
        from events
        where array_length(captions, 1) > 0 or slide_text is not null
    ),
    fetched_assets(id, num) as (
        select event_id, count(uri)
        from event_texts
        group by event_id
    ),
    incomplete_events(id, updated) as (
        select events.id, events.updated
        from events
        left join fetched_assets on fetched_assets.id = events.id
        where coalesce(num, 0)
            < coalesce(array_length(captions, 1), 0)
                + case when slide_text is null then 0 else 1 end
    ),
    failed_events as (
        select id
        from incomplete_events
        left join event_texts_queue on event_texts_queue.event_id = id
        where event_texts_queue.event_id is null
    )
";

async fn text_status(db: DbConnection) -> Result<()> {
    let (selection, mapping) = select!(
        queue_total_count: "(select count(*) from event_texts_queue)",
        queue_ready_count: "(select count(*) from event_texts_queue where now() > fetch_after)",
        queue_failed_count: "(select count(*) from event_texts_queue where retry_count > 0)",
        next_ready: "(select min(fetch_after) from event_texts_queue)",
        events_with_text: "(select count(*) from (select distinct event_id from event_texts) as t)",
        num_texts: "(select count(*) from event_texts)",
        events_with_text_assets: "(select count(*) from events_with_text_assets)",
        incomplete_events: "(select count(*) from incomplete_events)",
        failed_events: "(select count(*) from failed_events)",
    );
    let sql = format!("with {HELPER_QUERIES} select {selection}");
    let row = db.query_one(&sql, &[]).await?;

    let queue_total_count: i64 = mapping.queue_total_count.of(&row);
    let queue_ready_count: i64 = mapping.queue_ready_count.of(&row);
    let queue_failed_count: i64 = mapping.queue_failed_count.of(&row);
    let next_ready: Option<DateTime<Utc>> = mapping.next_ready.of(&row);
    let events_with_text: i64 = mapping.events_with_text.of(&row);
    let num_texts: i64 = mapping.num_texts.of(&row);
    let events_with_text_assets: i64 = mapping.events_with_text_assets.of(&row);
    let incomplete_events: i64 = mapping.incomplete_events.of(&row);
    let failed_events: i64 = mapping.failed_events.of(&row);

    println!();
    bunt::println!("{$bold}# Queue:{/$}");
    info_line!("Queue length", queue_total_count);
    info_line!("Ready entries in queue", queue_ready_count);
    info_line!("Queue entries that failed before", queue_failed_count);
    if let Some(next_ready) = next_ready {
        info_line!("Next queue entry ready at", next_ready);
    }

    println!();
    bunt::println!("{$bold}# Texts:{/$}");
    info_line!("Events with text assets", events_with_text_assets);
    info_line!("Events with fetched texts", events_with_text);
    info_line!("Fetched text assets", num_texts);
    info_line!("Incomplete events", incomplete_events);
    info_line!("Incomplete events not queued (failed)", failed_events);

    Ok(())
}
