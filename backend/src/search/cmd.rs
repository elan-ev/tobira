use meilisearch_sdk::indexes::Index;
use structopt::StructOpt;

use crate::{prelude::*, config::Config, db};

use super::Client;


#[derive(Debug, StructOpt)]
pub(crate) enum SearchIndexCommand {
    /// Shows some information about the search index.
    Status,

    /// Removes all data from the search index.
    Clear,

    /// Completely rebuild the search index from data in the DB. Can take a while!
    Rebuild,
}

/// Entry point for `search-index` commands.
pub(crate) async fn run(cmd: &SearchIndexCommand, config: &Config) -> Result<()> {
    let meili = config.meili.connect().await?;

    match cmd {
        SearchIndexCommand::Status => status(&meili).await?,
        SearchIndexCommand::Clear => clear(meili).await?,
        SearchIndexCommand::Rebuild => rebuild(&meili, config).await?,
    }

    Ok(())
}

// ===== Rebuild ===============================================================================

async fn rebuild(meili: &Client, config: &Config) -> Result<()> {
    let pool = db::create_pool(&config.db).await?;
    let db = pool.get().await?;
    super::rebuild_index(meili, &db).await
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
    index_status(&meili.event_index).await?;
    println!();
    index_status(&meili.realm_index).await?;
    println!();

    Ok(())
}

async fn index_status(index: &Index) -> Result<()> {
    let info = index.fetch_info().await?;
    let stats = index.get_stats().await?;
    bunt::println!("{$bold}# Index `{[green+intense]}`:{/$}", info.uid);
    info_line!("Number of documents", stats.number_of_documents);
    info_line!("Is currently indexing", stats.is_indexing);
    info_line!("Created", info.createdAt);
    info_line!("Updated", info.updatedAt);

    Ok(())
}


// ===== Clear =================================================================================

async fn clear(meili: Client) -> Result<()> {
    println!("Are you sure you want to clear the search index? The search will be disabled \
        until you rebuild the index! Type 'yes' to proceed to delete the data.");

    let mut line = String::new();
    std::io::stdin().read_line(&mut line).context("could not read from stdin")?;
    if line.trim() != "yes" {
        println!("Answer was not 'yes'. Aborting.");
        bail!("user did not confirm deleting index: operation was aborted.");
    }

    // Actually delete
    meili.event_index.delete().await?;

    info!("Deleted search index");
    Ok(())
}
