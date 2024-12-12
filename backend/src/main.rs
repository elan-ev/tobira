//! The Tobira backend server.

#[cfg(not(target_env = "msvc"))]
#[global_allocator]
static GLOBAL: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;

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
mod rss;


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

        // This check whether the backtrace is present is somewhat bad. But it
        // works for now. If that special string changes at some point, we will
        // just print a bit of useless information -> nothing bad will happen.
        // And the whole backtrace situation in `anyhow` should improve in the
        // future anyway.
        let backtrace = e.backtrace().to_string();
        if backtrace != "disabled backtrace" {
            eprintln!();
            bunt::eprintln!("{$red+italic}Backtrace:{/$}");
            eprintln!("{backtrace}");
        }

        std::process::exit(1);
    }
}

/// Main entry point.
async fn run() -> Result<()> {
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
            let config = load_config_and_init_logger(shared, &args, "serve")?;
            start_server(config).await?;
        }
        Command::Sync { args: sync_args, shared } => {
            let cmd_name = if sync_args.is_long_running() { "sync" } else { "cli" };
            let config = load_config_and_init_logger(shared, &args, cmd_name)?;
            sync::cmd::run(sync_args, &config).await?;
        }
        Command::Db { cmd, shared } => {
            let config = load_config_and_init_logger(shared, &args, "cli")?;
            db::cmd::run(cmd, &config).await?;
        }
        Command::SearchIndex { cmd, shared } => {
            let cmd_name = if cmd.is_long_running() { "search-index-update" } else { "cli" };
            let config = load_config_and_init_logger(shared, &args, cmd_name)?;
            search::cmd::run(cmd, &config).await?;
        }
        Command::Worker { shared } => {
            let config = load_config_and_init_logger(shared, &args, "worker")?;
            start_worker(config).await?;
        }
        Command::Check { shared } => cmd::check::run(shared, &args).await?,
        Command::WriteConfig { target } => config::write_template(target.as_ref())?,
        Command::ExportApiSchema { args } => cmd::export_api_schema::run(args)?,
        Command::ImportRealmTree { options, shared } => {
            let config = load_config_and_init_logger(shared, &args, "cli")?;
            cmd::import_realm_tree::run(options, &config).await?;
        }
        Command::KnownGroups { options, shared } => {
            let config = load_config_and_init_logger(shared, &args, "cli")?;
            cmd::known_groups::run(config, options).await?;
        }
        Command::KnownUsers { options, shared } => {
            let config = load_config_and_init_logger(shared, &args, "cli")?;
            cmd::known_users::run(config, options).await?;
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
    let text_conn = db.get().await?;
    let db_maintenance_conn = db.get().await?;
    let stats_conn = db.get().await?;
    let auth_config = config.auth.clone();

    default_enable_backtraces();
    tokio::select! {
        res = search::update_index_daemon(&search, &mut search_conn) => {
            res.context("error updating the search index")
        }
        res = sync::run(true, sync_conn, &config) => {
            res.map(|()| unreachable!("sync task unexpectedly stopped"))
                .context("error synchronizing with Opencast")
        }
        res = sync::text::fetch_update(text_conn, &config, true) => {
            res.map(|()| unreachable!("sync text task unexpectedly stopped"))
                .context("error downloading text assets")
        }
        never = sync::stats::run_daemon(stats_conn, &config) => { never }
        never = auth::db_maintenance(&db_maintenance_conn, &auth_config) => { never }
    }
}


fn load_config_and_init_logger(shared: &args::Shared, args: &Args, cmd: &str) -> Result<Config> {
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
    logger::init(&config.log, args, cmd)?;
    info!(cli_args = ?std::env::args().collect::<Vec<_>>(), "Starting Tobira");
    info!(source_file = ?path.display(), "Loaded config");
    debug!(cmd, "Initialized logger");

    config.lint();

    Ok(config)
}

async fn connect_and_migrate_db(config: &Config) -> Result<Pool> {
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;
    Ok(db)
}


/// Sets `RUST_BACKTRACE` to 1 if it is undefined.
///
/// This is called in long running subcommands after the setup. The idea is that
/// backtraces are very important to debug bugs. And in long running commands
/// like `serve` or `worker`, we are likely to find some rare bugs that are
/// difficult to reproduce. On the other hand, getting a big backtrace is
/// usually not helpful when you either just started a long running command
/// (e.g. DB not reachable) or if you are using Tobira's CLI tools (like `db
/// clear` or `known-groups add`).
///
/// Generating a backtrace is somewhat costly, which is why it is disabled
/// by default. However, we don't expect panics to occur regularly, so it
/// shouldn't be a problem. Only consideration: maaaybe this is a way to DOS
/// tobira? If someone finds a request that triggers a panic?
fn default_enable_backtraces() {
    if env::var("RUST_BACKTRACE") == Err(env::VarError::NotPresent) {
        env::set_var("RUST_BACKTRACE", "1");
    }
}
