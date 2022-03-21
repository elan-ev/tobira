//! The Tobira backend server.

use std::env;
use structopt::StructOpt;

use crate::{
    args::{Args, Command},
    config::Config,
    prelude::*,
};

mod api;
mod args;
mod auth;
mod config;
mod cmd;
mod db;
mod http;
mod logger;
mod prelude;
mod search;
mod sync;
mod util;

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        // Log error in case stdout is not connected and it is logged into a file.
        error!("{:?}", e);

        // Show a somewhat nice representation of the error
        eprintln!();
        eprintln!();
        bunt::eprintln!("{$red}▶▶▶ {$bold}Error:{/$}{/$} {[yellow+intense]}", e);
        eprintln!();
        bunt::eprintln!("{$red+italic}Caused by:{/$}");

        for (i, cause) in e.chain().skip(1).enumerate() {
            eprint!(" {: >1$}", "", i * 2);
            eprintln!("‣ {cause}");
        }

        std::process::exit(1);
    }
}

/// Main entry point.
async fn run() -> Result<()> {
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
    // This is a bit roundabout because we want to override the version
    // using some runtime code.
    let args = Args::from_clap(
        &Args::clap()
            .version(&*version())
            .get_matches(),
    );

    // Dispatch subcommand.
    match &args.cmd {
        Command::Serve { shared } => {
            let config = load_config_and_init_logger(shared)?;
            start_server(config).await?;
        }
        Command::Sync { daemon, shared } => {
            let config = load_config_and_init_logger(shared)?;
            sync::run(*daemon, &config).await?;
        }
        Command::Db { cmd, shared } => {
            let config = load_config_and_init_logger(shared)?;
            db::cmd::run(cmd, &config.db).await?;
        }
        Command::SearchIndex { cmd, shared } => {
            let config = load_config_and_init_logger(shared)?;
            search::cmd::run(cmd, &config).await?;
        }
        Command::WriteConfig { target } => config::write_template(target.as_ref())?,
        Command::ExportApiSchema { args } => cmd::export_api_schema::run(args)?,
        Command::ImportRealmTree { options, shared } => {
            let config = load_config_and_init_logger(shared)?;
            cmd::import_realm_tree::run(options, &config).await?;
        }
    }

    Ok(())
}

async fn start_server(config: Config) -> Result<()> {
    info!("Starting Tobira backend ...");
    trace!("Configuration: {:#?}", config);

    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;

    // Start DB maintenance jobs
    let conn = db.get().await?;
    let auth_config = config.auth.clone();
    tokio::spawn(async move { auth::db_maintenance(&conn, &auth_config).await });

    // Start web server
    let root_node = api::root_node();
    http::serve(config, root_node, db).await
        .context("failed to start HTTP server")?;

    Ok(())
}

fn load_config_and_init_logger(args: &args::Shared) -> Result<Config> {
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

/// Gives you information about this very version of Tobira,
/// i.e. it's semantic version, which commit it was built from,
/// and when. It also indicates whether or not the working directory
/// was clean at the time, since this is a potential source of errors.
pub fn version() -> String {
    mod build_info {
        include!(concat!(env!("OUT_DIR"), "/built.rs"));
    }
    format!(
        "{} ({}{}), built {}",
        build_info::PKG_VERSION,
        build_info::GIT_COMMIT_HASH.unwrap(),
        if let Some(true) = build_info::GIT_DIRTY {
            ", dirty"
        } else {
            ""
        },
        build_info::BUILT_TIME_UTC,
    )
}
