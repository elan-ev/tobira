use anyhow::{Context, Result};
use log::info;

use crate::{
    args::DbCommand,
    config,
};
use super::{Db, create_pool, query};


pub(crate) async fn run(cmd: &DbCommand, config: &config::Db) -> Result<()> {
    // Connect to database
    let pool = create_pool(config).await?;
    let db = pool.get().await?;

    // Dispatch command
    match cmd {
        DbCommand::Clear => clear(&db).await,
    }
}


async fn clear(db: &Db) -> Result<()> {
    let tables = query::all_table_names(db).await?;
    if tables.is_empty() {
        info!("The database does not contain any tables, so there is nothing to do.");
        return Ok(());
    }

    log::warn!("You are about to delete all existing data and tables in the database!");
    println!("The database currently holds these tables:");
    for name in &tables {
        println!(" - {}", name);
    }
    println!();
    println!("Are you sure you want to remove all tables? Please double-check the server \
        you are running this on! Type 'yes' to proceed to delete the data.");

    let mut line = String::new();
    std::io::stdin().read_line(&mut line).context("could not read from stdin")?;
    if line.trim() != "yes" {
        println!("Answer was not 'yes'. Aborting.");
        return Ok(());
    }

    super::drop_tables(db, &tables).await
}
