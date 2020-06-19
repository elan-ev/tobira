//! The Olav backend server.

use anyhow::{Context, Result};


mod api;
mod config;
mod db;
mod http;


#[tokio::main]
async fn main() -> Result<()> {
    pretty_env_logger::init();

    let config = config::Config::from_default_locations()
        .context("failed to load configuration")?;
    println!("{:#?}", config);

    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool")?;

    let root_node = api::root_node();
    let context = api::Context { db };

    http::serve(&config.http, root_node, context).await?;

    Ok(())
}
