//! This module defines the command line arguments Tobira accepts.

use std::path::PathBuf;
use structopt::StructOpt;


#[derive(Debug, StructOpt)]
#[structopt(
    about = "Video portal for Opencast.",
    after_help = "When run without subcommand, the Tobira backend server is started.",
    setting(structopt::clap::AppSettings::VersionlessSubcommands),
)]
pub(crate) struct Args {
    /// Path to the configuration file. If this is not specified, Tobira will
    /// try opening `config.toml` or `/etc/tobira/config.toml`.
    #[structopt(short, long)]
    pub(crate) config: Option<PathBuf>,

    #[structopt(subcommand)]
    pub(crate) cmd: Option<Command>,
}

#[derive(Debug, StructOpt)]
pub(crate) enum Command {
    /// Outputs a template for the configuration file (which includes
    /// descriptions or all options).
    WriteConfig {
        /// Target file. If not specified, the template is written to stdout.
        target: Option<PathBuf>,
    },

    /// Database operations.
    Db {
        #[structopt(subcommand)]
        cmd: DbCommand,
    },
}

#[derive(Debug, StructOpt)]
pub(crate) enum DbCommand {
    /// Removes all data and tables from the database.
    Clear,

    /// Runs an `.sql` script with the configured database connection.
    Script {
        /// Path to a file containing an SQL script.
        script: PathBuf,
    },

    /// Runs the database migrations that also automatically run when starting
    /// the server.
    Migrate,
}
