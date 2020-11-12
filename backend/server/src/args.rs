//! This module defines the command line arguments Tobira accepts.

use std::path::PathBuf;
use structopt::StructOpt;


#[derive(Debug, StructOpt)]
#[structopt(
    about = "Video portal for Opencast.",
    setting(structopt::clap::AppSettings::VersionlessSubcommands),
)]
pub(crate) struct Args {
    /// Path to the configuration file. If this is not specified, Tobira will
    /// try opening `config.toml` or `/etc/tobira/config.toml`.
    #[structopt(short, long)]
    pub(crate) config: Option<PathBuf>,
}
