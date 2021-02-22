//! The Tobira backend server.

use std::env;
use structopt::StructOpt;
use tokio_compat_02::FutureExt;

use tobira_util::prelude::*;
use crate::{
    args::{Args, Command},
    config::Config,
};

pub(crate) use tobira_api as api;
mod args;
mod config;
mod db;
mod http;
mod logger;


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

    // Parse CLI args.
    let args = Args::from_args();

    // Dispatch subcommand.
    match &args.cmd {
        None => {
            let config = load_config_and_init_logger(&args)?;
            start_server(&config).compat().await?;
        }
        Some(Command::WriteConfig { target }) => {
            if args.config.is_some() {
                bail!("`-c/--config` parameter is not valid for this subcommand");
            }
            config::write_template(target.as_ref())?
        }
        Some(Command::Db { cmd }) => {
            let config = load_config_and_init_logger(&args)?;
            db::cmd::run(cmd, &config.db).compat().await?;
        }
    }

    Ok(())
}

async fn start_server(config: &Config) -> Result<()> {
    info!("Starting Tobira backend...");
    trace!("Configuration: {:#?}", config);

    http::serve(&config, api::root_node()).await
        .context("failed to start HTTP server")?;

    Ok(())
}

fn load_config_and_init_logger(args: &Args) -> Result<Config> {
    // Load configuration.
    let config = match &args.config {
        Some(path) => Config::load_from(path)
            .context(format!("failed to load config from '{}'", path.display()))?,
        None => Config::from_default_locations()?,
    };

    // Initialize logger. Unfortunately, we can only do this here
    // after reading the config.
    logger::init(&config.log)?;

    Ok(config)
}
