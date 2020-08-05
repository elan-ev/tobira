//! The Tobira backend server.

use anyhow::{Context, Result};
use log::{info, trace};


mod api;
mod config;
mod db;
mod http;


#[tokio::main]
async fn main() -> Result<()> {
    // If no logging level was specified, we default to "debug", but just for
    // our own code.
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "tobira=debug");
    }
    pretty_env_logger::init();

    info!("Starting Tobira backend...");

    let config = config::Config::from_default_locations()
        .context("failed to load configuration")?;
    trace!("Using configuration: {:#?}", config);

    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;

    let root_node = api::root_node();
    let context = api::Context { db };

    http::serve(&config.http, root_node, context).await
        .context("failed to start HTTP server")?;

    Ok(())
}
