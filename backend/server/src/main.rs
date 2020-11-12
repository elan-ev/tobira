//! The Tobira backend server.

use anyhow::{Context, Result};
use log::{info, trace};
use std::env;
use structopt::StructOpt;
use crate::{
    args::Args,
    config::Config,
};

pub(crate) use tobira_api as api;
mod args;
mod config;
mod db;
mod http;


#[tokio::main]
async fn main() -> Result<()> {
    // If `RUST_BACKTRACE` wasn't already set, we default to `1`. Backtraces are
    // almost always useful for debugging. Generating a backtrace is somewhat
    // costly, which is why it is disabled by default. However, we don't expect
    // panics to occur regularly, so it shouldn't be a problem. Only
    // consideration: maaaybe this is a way to DOS tobira? If someone finds a
    // request that triggers a panic?
    if env::var("RUST_BACKTRACE") == Err(env::VarError::NotPresent) {
        env::set_var("RUST_BACKTRACE", "1");
    }

    // If no logging level was specified, we default to "debug", but just for
    // our own code.
    if env::var("RUST_LOG") == Err(env::VarError::NotPresent) {
        env::set_var("RUST_LOG", "tobira=debug");
    }
    pretty_env_logger::init();

    info!("Starting Tobira backend...");

    // Parse CLI args.
    let args = Args::from_args();
    trace!("Command line arguments: {:#?}", args);

    // Load configuration
    let config = match &args.config {
        Some(path) => Config::load_from(path),
        None => Config::from_default_locations(),
    }.context("failed to load configuration")?;
    trace!("Configuration: {:#?}", config);

    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;

    let root_node = api::root_node();
    let context = api::Context::new(db).await?;

    http::serve(&config.http, root_node, context).await
        .context("failed to start HTTP server")?;

    Ok(())
}
