use meilisearch_sdk::indexes::Index;

use crate::{prelude::*, config::Config, db};

use super::{Client, util};


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

    /// Completely clears (optional) and rebuilds the search index from data in
    /// the DB. Can take a while!
    Rebuild {
        /// If specified, does not clear the index before rebuild. Note that
        /// this can leave remnants of old items in there.
        #[clap(long)]
        without_clear: bool,
    },

    /// Reads queued updates from the DB and pushes them into the search index.
    Update {
        /// If specified, will not stop after clearing the queue, but runs
        /// forever regularly updating.
        #[clap(long)]
        daemon: bool,
    },
}

/// Entry point for `search-index` commands.
pub(crate) async fn run(cmd: &SearchIndexCommand, config: &Config) -> Result<()> {
    let meili = config.meili.connect_only().await?;

    match cmd {
        SearchIndexCommand::Status => status(&meili).await?,
        SearchIndexCommand::Clear { yes_absolutely_clear_index: yes } => clear(meili, *yes).await?,
        SearchIndexCommand::Update { daemon } => update(&meili, config, *daemon).await?,
        SearchIndexCommand::Rebuild { without_clear } => {
            if !without_clear {
                clear(meili.clone(), false).await?;
            }

            rebuild(&meili, config).await?;
        }
    }

    Ok(())
}

// ===== Rebuild ===============================================================================

async fn rebuild(meili: &Client, config: &Config) -> Result<()> {
    let pool = db::create_pool(&config.db).await?;
    let mut db = pool.get().await?;
    meili.prepare(&mut db).await?;
    super::rebuild_index(meili, &mut db).await
}


// ===== Update ================================================================================

async fn update(meili: &Client, config: &Config, daemon: bool) -> Result<()> {
    let pool = db::create_pool(&config.db).await?;
    let mut db = pool.get().await?;
    meili.prepare(&mut db).await?;

    if daemon {
        super::update_index_daemon(meili, &mut db).await.map(|_| ())
    } else {
        super::update_index(meili, &mut db).await?;
        info!("Done updating the search index (no more items queued)");
        Ok(())
    }
}


// ===== Clear =================================================================================

async fn clear(meili: Client, yes: bool) -> Result<()> {
    if !yes {
        println!("Are you sure you want to clear the search index? The search will be disabled \
            until you rebuild the index! Type 'yes' to proceed to delete the data.");
        crate::cmd::prompt_for_yes()?;
    }

    // Actually delete
    super::clear(meili).await
}


// ===== Status ================================================================================

macro_rules! info_line {
    ($label:expr, $value:expr) => {
        bunt::println!("{$dimmed}{}:{/$} {[blue+intense]}", $label, $value);
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
    info_line!("Version", meili.client.get_version().await?.pkg_version);
    info_line!("Health", meili.client.health().await?.status);
    println!();

    // Individual indexes
    index_status("event", &meili.event_index).await?;
    println!();
    index_status("realm", &meili.realm_index).await?;
    println!();

    Ok(())
}

async fn index_status(name: &str, index: &Index) -> Result<()> {
    bunt::println!("{$bold}# Index `{[green+intense]}`:{/$}", name);

    let info = match index.fetch_info().await {
        Ok(info) => info,
        Err(e) if util::is_index_not_found(&e) => {
            bunt::println!("{$red+intense}Does not exist!{/$}");
            return Ok(());
        },
        Err(e) => return Err(e.into()),
    };
    let stats = index.get_stats().await?;
    info_line!("Number of documents", stats.number_of_documents);
    info_line!("Is currently indexing", stats.is_indexing);
    info_line!("Created", info.createdAt);
    info_line!("Updated", info.updatedAt);

    Ok(())
}

