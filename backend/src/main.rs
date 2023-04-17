//! The Tobira backend server.

use clap::{FromArgMatches, CommandFactory};
use deadpool_postgres::Pool;
use util::Never;
use std::env;

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
mod metrics;
mod prelude;
mod search;
mod sync;
mod util;
mod version;


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
        if e.chain().len() > 1 {
            bunt::eprintln!("{$red+italic}Caused by:{/$}");
        }

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
    let args = Args::from_arg_matches(
        &Args::command()
            .version(version::full())
            .get_matches(),
    )?;

    // Configure output via `bunt`
    bunt::set_stdout_color_choice(args.stdout_color());
    bunt::set_stderr_color_choice(args.stderr_color());


    // Dispatch subcommand.
    match &args.cmd {
        Command::Serve { shared } => {
            let config = load_config_and_init_logger(shared, &args)?;
            start_server(config).await?;
        }
        Command::Sync { args: sync_args, shared } => {
            let config = load_config_and_init_logger(shared, &args)?;
            sync::cmd::run(sync_args, &config).await?;
        }
        Command::Db { cmd, shared } => {
            let config = load_config_and_init_logger(shared, &args)?;
            db::cmd::run(cmd, &config).await?;
        }
        Command::SearchIndex { cmd, shared } => {
            let config = load_config_and_init_logger(shared, &args)?;
            search::cmd::run(cmd, &config).await?;
        }
        Command::Worker { shared } => {
            let config = load_config_and_init_logger(shared, &args)?;
            start_worker(config).await?;
        }
        Command::Check { shared } => cmd::check::run(shared, &args).await?,
        Command::WriteConfig { target } => config::write_template(target.as_ref())?,
        Command::ExportApiSchema { args } => cmd::export_api_schema::run(args)?,
        Command::ImportRealmTree { options, shared } => {
            let config = load_config_and_init_logger(shared, &args)?;
            cmd::import_realm_tree::run(options, &config).await?;
        }
    }

    Ok(())
}

async fn start_server(config: Config) -> Result<()> {
    info!("Starting Tobira backend ...");
    trace!("Configuration: {:#?}", config);
    let db = connect_and_migrate_db(&config).await?;
    let search = search::Client::new(config.meili.clone());
    if let Err(e) = search.check_connection().await {
        warn!("Could not connect to Meili search index: {e:?}");
    }

    // Start web server
    let root_node = api::root_node();
    http::serve(config, root_node, db, search).await
        .context("failed to start HTTP server")?;

    Ok(())
}

async fn start_worker(config: Config) -> Result<Never> {
    info!("Starting Tobira worker ...");

    let db = connect_and_migrate_db(&config).await?;
    let search = config.meili.connect().await.context("failed to connect to MeiliSearch")?;

    let mut search_conn = db.get().await?;
    let sync_conn = db.get().await?;
    let db_maintenance_conn = db.get().await?;
    let auth_config = config.auth.clone();

    tokio::select! {
        res = search::update_index_daemon(&search, &mut search_conn) => {
            res.context("error updating the search index")
        }
        res = sync::run(true, sync_conn, &config) => {
            res.map(|()| unreachable!("sync task unexpectedly stopped"))
                .context("error synchronizing with Opencast")
        }
        never = auth::db_maintenance(&db_maintenance_conn, &auth_config) => { never }
    }
}


fn load_config_and_init_logger(shared: &args::Shared, args: &Args) -> Result<Config> {
    // Load configuration.
    let (config, path) = match &shared.config {
        Some(path) => {
            let config = Config::load_from(path)
                .context(format!("failed to load config from '{}'", path.display()))?;
            (config, path.clone())
        }
        None => Config::from_env_or_default_locations()?,
    };

    // Initialize logger. Unfortunately, we can only do this here
    // after reading the config.
    logger::init(&config.log, args)?;
    info!("Loaded config from '{}'", path.display());

    Ok(config)
}

async fn connect_and_migrate_db(config: &Config) -> Result<Pool> {
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;
    Ok(db)
}
