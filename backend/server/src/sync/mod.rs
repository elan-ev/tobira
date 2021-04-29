use tobira_util::prelude::*;
use crate::config::Config;

pub(crate) async fn run(config: &Config) -> Result<()> {
    info!("Starting Tobira <-> Opencast synchronization server ...");
    trace!("Configuration: {:#?}", config);

    Ok(())
}
