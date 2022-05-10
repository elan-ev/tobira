//! A subcommand making sure various things are working. Useful for updating
//! Tobira where you want to check as many things as possible as early as
//! possible.

use anyhow::Result;

use crate::{
    args,
    load_config_and_init_logger,
    config::Config,
    prelude::*, db,
    sync::harvest::HarvestClient,
};


pub(crate) async fn run(shared: &args::Shared) -> Result<()> {
    let config = load_config_and_init_logger(shared)
        .context("failed to load config: cannot proceed with `check` command")?;


    // Perform main checks
    info!("Starting to verify various things...");
    let referenced_files = check_referenced_files(&config).await;
    let meili = check_meili(&config).await;
    let db_pool = db::create_pool(&config.db).await;
    let opencast_sync = check_opencast_sync(&config).await;
    info!("Done verifing various things");


    // Print summary after all log output
    let mut any_errors = false;
    println!();
    bunt::println!("{$bold+blue+intense}Summary{/$}");
    println!();
    print_outcome(&mut any_errors, "Load configuration", &Ok(()));
    print_outcome(&mut any_errors, "Checking all referenced files", &referenced_files);
    print_outcome(&mut any_errors, "Connection to MeiliSearch", &meili);
    print_outcome(&mut any_errors, "Connection to DB", &db_pool);
    print_outcome(&mut any_errors, "Connection to Opencast harvesting API", &opencast_sync);

    println!();
    if any_errors {
        bunt::println!("{$red+intense}➡  Errors have occured!{/$}");
        std::process::exit(1);
    } else {
        bunt::println!("{$green+intense}⮕  Everything OK{/$} \
            {$dimmed}(Tobira probably works in this environment){/$}");
        println!("   ");
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
            println!();
            bunt::println!("      {$red+italic}Caused by:{/$}");

            for (i, cause) in e.chain().skip(1).enumerate() {
                print!("       {: >1$}", "", i * 2);
                println!("‣ {cause}");
            }
            println!();
        }
    }
}

async fn check_referenced_files(config: &Config) -> Result<()> {
    // TODO: log file & unix socket?

    let files = [
        &config.theme.logo.large.path,
        &config.theme.logo.small.path,
        &config.theme.favicon,
        &config.auth.jwt.secret_key,
    ];

    for path in files {
        debug!("Trying to open '{}' for reading...", path.display());
        let _ = tokio::fs::File::open(path)
            .await
            .context(format!("could not open '{}' for reading", path.display()))?;
    }

    Ok(())
}

async fn check_meili(config: &Config) -> Result<()> {
    // TODO: maybe check additional things?
    let _meili = config.meili.connect_only().await?;
    Ok(())
}

async fn check_opencast_sync(config: &Config) -> Result<()> {
    HarvestClient::new(config).test_connection().await
}
