use std::time::Instant;

use meilisearch_sdk::{indexes::Index, errors::ErrorCode};

use crate::{prelude::*, config::Config, db, search::meta::IndexState};

use super::Client;


#[derive(Debug, clap::Subcommand)]
pub(crate) enum SearchIndexCommand {
    /// Shows some information about the search index.
    Status,

    /// Removes all data from the search index.
    Clear {
        /// If specified, skips the "Are you sure?" question.
        #[clap(long)]
        yes_absolutely_clear_index: bool,
    },

    /// Completely clears and rebuilds the search index from data in the DB. Can
    /// take a while!
    Rebuild,

    /// Reads queued updates from the DB and pushes them into the search index.
    Update {
        /// If specified, will not stop after clearing the queue, but runs
        /// forever regularly updating.
        #[clap(long)]
        daemon: bool,
    },
}

impl SearchIndexCommand {
    pub(crate) fn is_long_running(&self) -> bool {
        matches!(self, Self::Update { daemon: true })
    }
}

/// Entry point for `search-index` commands.
pub(crate) async fn run(cmd: &SearchIndexCommand, config: &Config) -> Result<()> {
    let meili = config.meili.connect().await?;

    match cmd {
        SearchIndexCommand::Status => status(&meili).await?,
        SearchIndexCommand::Clear { yes_absolutely_clear_index: yes }
            => clear(meili, config, *yes).await?,
        SearchIndexCommand::Update { daemon } => update(&meili, config, *daemon).await?,
        SearchIndexCommand::Rebuild => rebuild(&meili, config).await?,
    }

    Ok(())
}

// ===== Rebuild ===============================================================================

async fn rebuild(meili: &Client, config: &Config) -> Result<()> {
    let pool = db::create_pool(&config.db).await?;
    let mut db = pool.get().await?;

    println!("Are you sure you want to clear and rebuild the search index? (type 'yes' to confirm)");
    crate::cmd::prompt_for_yes()?;

    super::writer::with_write_lock(&mut db, meili, |tx, meili| Box::pin(async move {
        let tasks = super::rebuild(&meili, tx).await?;

        info!("Waiting for Meili to complete indexing...\n\
            (note: you may ctrl+c this command now -- this won't stop indexing)");
        let before = Instant::now();
        for task in tasks {
            super::util::wait_on_task(task, &meili).await?;
        }
        info!("Meili finished indexing in {:.1?}", before.elapsed());

        Ok(())
    })).await
}


// ===== Update ================================================================================

async fn update(meili: &Client, config: &Config, daemon: bool) -> Result<()> {
    let pool = db::create_pool(&config.db).await?;
    let mut db = pool.get().await?;
    meili.prepare_and_rebuild_if_necessary(&mut db).await?;

    if daemon {
        super::update_index_daemon(meili, &pool).await.map(|_| ())
    } else {
        super::update_index(meili, &mut db).await?;
        info!("Done updating the search index (no more items queued)");
        Ok(())
    }
}


// ===== Clear =================================================================================

async fn clear(meili: Client, config: &Config, yes: bool) -> Result<()> {
    if !yes {
        println!("Are you sure you want to clear the search index? The search will be disabled \
            until you rebuild the index! Type 'yes' to proceed to delete the data.");
        crate::cmd::prompt_for_yes()?;
    }

    // Actually delete
    let pool = db::create_pool(&config.db).await?;
    let mut db = pool.get().await?;
    super::writer::with_write_lock(&mut db, &meili, |_tx, meili| Box::pin(async move {
        super::clear(&meili).await
    })).await
}


// ===== Status ================================================================================

macro_rules! info_line {
    ($label:expr, $value:expr) => {
        bunt::println!("{$dimmed}{}:{/$} {[blue+intense]}", $label, $value);
    };
}

macro_rules! with_index {
    ($index:expr, $index_name:expr, |$index_arg:ident| $body:tt) => {
        match $index.get_stats().await {
            Err(meilisearch_sdk::errors::Error::Meilisearch(e))
                if e.error_code == ErrorCode::IndexNotFound =>
            {
                bunt::println!("{$yellow}Index '{}' not found{/$}", $index_name);
            }
            Err(_) => {
                bunt::println!("{$yellow}Error getting info about index '{}'{/$}", $index_name);
            }
            Ok(_) => {
                let $index_arg = &$index;
                $body
            }
        }
    };
}


async fn status(meili: &Client) -> Result<()> {
    // Configuration
    println!();
    bunt::println!("{$bold}# Configuration:{/$}");
    info_line!("Host", meili.config.host);
    info_line!("Index prefix", meili.config.index_prefix);
    println!();

    // Server information
    const GIBI_BYTE: usize = 1024 * MEBI_BYTE;
    const MEBI_BYTE: usize = 1024 * KIBI_BYTE;
    const KIBI_BYTE: usize = 1024;

    let size = meili.client.get_stats().await?.database_size;
    let human_size = if size > GIBI_BYTE {
        format!("{:.1} GiB", size as f64 / GIBI_BYTE as f64)
    } else if size > MEBI_BYTE {
        format!("{:.1} MiB", size as f64 / MEBI_BYTE as f64)
    } else {
        format!("{:.1} KiB", size as f64 / KIBI_BYTE as f64)
    };

    bunt::println!("{$bold}# Server info:{/$}");
    info_line!("Database size (all indexes)", human_size);
    info_line!("Meili version", meili.client.get_version().await?.pkg_version);
    info_line!("Health", meili.client.health().await?.status);
    println!();

    with_index!(meili.meta_index, meili.config.meta_index_name(), |index| {
        let state = IndexState::fetch(index).await?;
        bunt::println!("{$bold}# Schema info:{/$}");
        match state {
            IndexState::NoVersionInfo => println!("No information (empty index?)"),
            IndexState::BrokenVersionInfo => println!("Cannot read schema info"),
            IndexState::Info { dirty, version } => {
                info_line!("Schema version", version);
                info_line!("Dirty", dirty);
            }
        }
        info_line!("Needs rebuild", state.needs_rebuild());
    });
    println!();


    // Individual indexes
    index_status("event", &meili.event_index, meili.config.event_index_name()).await?;
    println!();
    index_status("series", &meili.series_index, meili.config.series_index_name()).await?;
    println!();
    index_status("realm", &meili.realm_index, meili.config.realm_index_name()).await?;
    println!();
    index_status("user", &meili.user_index, meili.config.user_index_name()).await?;
    println!();
    index_status("playlist", &meili.playlist_index, meili.config.playlist_index_name()).await?;
    println!();

    Ok(())
}

async fn index_status(name: &str, index: &Index, index_name: String) -> Result<()> {
    with_index!(index, index_name, |index| {
        bunt::println!("{$bold}# Index `{[green+intense]}`:{/$}", name);

        let stats = index.get_stats().await?;
        info_line!("Number of documents", stats.number_of_documents);
        info_line!("Is currently indexing", stats.is_indexing);
    });

    Ok(())
}
