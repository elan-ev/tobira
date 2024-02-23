//! A subcommand making sure various things are working. Useful for updating
//! Tobira where you want to check as many things as possible as early as
//! possible.

use anyhow::Result;
use meilisearch_sdk::errors::{MeilisearchError, ErrorCode};

use crate::{
    load_config_and_init_logger,
    args::{self, Args},
    config::Config,
    db::{self, MigrationPlan},
    prelude::*,
    sync::OcClient,
};


pub(crate) async fn run(shared: &args::Shared, args: &Args) -> Result<()> {
    let config = load_config_and_init_logger(shared, args)
        .context("failed to load config: cannot proceed with `check` command")?;


    // Perform main checks
    info!("Starting to verify various things...");
    let referenced_files = check_referenced_files(&config).await;
    let db_pool = db::create_pool(&config.db).await;
    let db_migrations = match &db_pool {
        Err(_) => None,
        Ok(pool) => Some(check_db_migrations(pool).await),
    };
    let meili = check_meili(&config).await;
    let opencast_sync = check_opencast_sync(&config).await;
    info!("Done verifing various things");


    // Print summary after all log output
    let mut any_errors = false;
    println!();
    bunt::println!("{$bold+blue+intense}Summary{/$}");
    println!();
    print_outcome(&mut any_errors, "Load configuration", &Ok(()));
    print_outcome(&mut any_errors, "Checking all referenced files", &referenced_files);
    print_outcome(&mut any_errors, "Connection to DB", &db_pool);
    if let Some(db_migrations) = db_migrations {
        print_outcome(&mut any_errors, "DB migrations", &db_migrations);
        match db_migrations {
            Err(_) => {},
            Ok(MigrationPlan::UpToDate)
                => println!("    ▸ DB up to date"),
            Ok(MigrationPlan::EmptyDb)
                => println!("    ▸ DB is empty, all migrations will be applied"),
            Ok(m @ MigrationPlan::Migrate { .. }) => println!(
                "    ▸ DB is compatible, {} new migrations will be applied",
                m.missing_migrations(),
            ),
        }
    }
    print_outcome(&mut any_errors, "MeiliSearch", &meili);
    match meili {
        Ok(true) => println!("    ▸ Requires rebuild (is automatically done by 'tobira worker')"),
        _ => {},
    }
    print_outcome(&mut any_errors, "Connection to Opencast harvesting API", &opencast_sync);

    println!();
    if any_errors {
        bunt::println!("{$red+intense}➡  Errors have occured!{/$}");
        std::process::exit(1);
    } else {
        bunt::println!("{$green+intense}⮕  Everything OK{/$} \
            {$dimmed}(Tobira probably works in this environment){/$}");
        println!();
        Ok(())
    }
}

fn print_outcome<T>(any_errors: &mut bool, label: &str, result: &Result<T>) {
    match result {
        Ok(_) => {
            bunt::println!(" ▸ {[bold+intense]}  {$green+bold}✔ ok{/$}", label);
        }
        Err(e) => {
            *any_errors = true;
            bunt::println!(" ▸ {[bold+intense]}  {$red+bold}✘ error{/$}", label);
            bunt::println!("      {$red}▶▶▶ {$bold}Error:{/$}{/$} {[yellow+intense]}", e);

            if e.chain().len() > 1 {
                bunt::println!("      {$red+italic}Caused by:{/$}");

                for (i, cause) in e.chain().skip(1).enumerate() {
                    print!("       {: >1$}", "", i * 2);
                    println!("‣ {cause}");
                }
            }

            println!();
        }
    }
}

async fn check_referenced_files(config: &Config) -> Result<()> {
    // TODO: log file & unix socket?

    let mut files = vec![
        &config.theme.favicon,
        &config.theme.logo.large.path,
    ];
    files.extend(config.theme.logo.small.as_ref().map(|l| &l.path));
    files.extend(config.theme.logo.large_dark.as_ref().map(|l| &l.path));
    files.extend(config.theme.logo.small_dark.as_ref().map(|l| &l.path));
    files.extend(config.auth.jwt.secret_key.as_ref());

    for path in files {
        debug!("Trying to open '{}' for reading...", path.display());
        let _ = tokio::fs::File::open(path)
            .await
            .context(format!("could not open '{}' for reading", path.display()))?;
    }

    config.db.check_server_cert()?;

    Ok(())
}

/// Returns `true` if a rebuild is necessary
async fn check_meili(config: &Config) -> Result<bool> {
    let meili = config.meili.connect().await?;

    // Check that the API key is valid and can access the indexes.
    let _ = meili.client.get_stats().await?;
    for index in [&meili.meta_index, &meili.event_index, &meili.realm_index] {
        match index.get_stats().await {
            Ok(_) => {},
            Err(meilisearch_sdk::errors::Error::Meilisearch(MeilisearchError {
                error_code: ErrorCode::IndexNotFound,
                ..
            }))  => {},
            Err(e) => Err(e)?,
        }
    }

    // Read index state.
    let state = crate::search::IndexState::fetch(&meili.meta_index).await?;
    info!("Search index state: {state:?}");

    Ok(state.needs_rebuild())
}

async fn check_opencast_sync(config: &Config) -> Result<()> {
    let client = OcClient::new(config)?;
    crate::sync::check_compatibility(&client).await?;
    client.test_harvest().await?;
    Ok(())
}

async fn check_db_migrations(db_pool: &deadpool_postgres::Pool) -> Result<MigrationPlan> {
    let mut db = db_pool.get().await?;
    let tx = db.transaction().await?;
    MigrationPlan::build(&tx).await
}
