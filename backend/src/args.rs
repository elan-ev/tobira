//! This module defines the command line arguments Tobira accepts.

use std::path::PathBuf;

use termcolor::ColorChoice;

use crate::{cmd, db::cmd::DbCommand, search::cmd::SearchIndexCommand};


#[derive(Debug, clap::Parser)]
#[clap(about = "Video portal for Opencast.")]
pub(crate) struct Args {
    #[clap(subcommand)]
    pub(crate) cmd: Command,

    /// Whether to use colors when printing to stdout and stderr. Possible
    /// values: never|auto|always.
    ///
    /// If set to/left at 'auto', color is used when stdout is a terminal, but
    /// not used if you are piping the output to a file, for example. You can
    /// then also disable colors by setting the env variable `NO_COLOR=1`.
    #[clap(
        long,
        global = true,
        default_value = "auto",
        value_parser = parse_color_choice,
    )]
    pub(crate) color: termcolor::ColorChoice,
}

#[derive(Debug, clap::Parser)]
pub(crate) enum Command {
    /// Starts the backend HTTP server.
    Serve {
        #[clap(flatten)]
        shared: Shared,
    },

    /// Tools for Tobira <-> Opencast synchronization.
    Sync {
        #[clap(flatten)]
        args: crate::sync::cmd::Args,

        #[clap(flatten)]
        shared: Shared,
    },

    /// Database operations.
    Db {
        #[clap(subcommand)]
        cmd: DbCommand,

        #[clap(flatten)]
        shared: Shared,
    },

    /// Search index operations
    SearchIndex {
        #[clap(subcommand)]
        cmd: SearchIndexCommand,

        #[clap(flatten)]
        shared: Shared,
    },

    /// Starts a worker/daemon process that performs all tasks that should be
    /// performed regularly.
    ///
    /// This currently includes: updating the search index and syncing with
    /// Opencast.
    Worker {
        #[clap(flatten)]
        shared: Shared,
    },

    /// Checks config, DB connection, and much more to find problems in Tobira's
    /// environment.
    ///
    /// Useful for updates as you can catch many errors early, without needing
    /// to restart the running Tobira process. Exits with 0 if everything is
    /// Ok, and with 1 otherwise.
    Check {
        #[clap(flatten)]
        shared: Shared,
    },

    /// Outputs a template for the configuration file (which includes
    /// descriptions or all options).
    WriteConfig {
        /// Target file. If not specified, the template is written to stdout.
        target: Option<PathBuf>,
    },

    /// Exports the API as GraphQL schema.
    ExportApiSchema {
        #[clap(flatten)]
        args: cmd::export_api_schema::Args,
    },

    /// Imports a realm tree from a YAML description (internal tool, no stability guaranteed!).
    ImportRealmTree {
        #[clap(flatten)]
        options: cmd::import_realm_tree::Args,

        #[clap(flatten)]
        shared: Shared,
    },

    /// Listing, adding, and removing known groups.
    KnownGroups {
        #[clap(subcommand)]
        options: cmd::known_groups::Args,

        #[clap(flatten)]
        shared: Shared,
    },

    /// Managing "known users". This data is only used for the ACL UI and not
    /// for auth at all!
    KnownUsers {
        #[clap(subcommand)]
        options: cmd::known_users::Args,

        #[clap(flatten)]
        shared: Shared,
    }
}

#[derive(Debug, clap::Args)]
pub(crate) struct Shared {
    /// Path to the configuration file. If this is not specified, Tobira will
    /// try opening the path inside `TOBIRA_CONFIG_PATH`, `config.toml` or
    /// `/etc/tobira/config.toml`.
    #[clap(short, long, global = true)]
    pub(crate) config: Option<PathBuf>,
}

fn parse_color_choice(s: &str) -> Result<ColorChoice, &'static str> {
    match s {
        "never" => Ok(ColorChoice::Never),
        "always" => Ok(ColorChoice::Always),
        "auto" => Ok(ColorChoice::Auto),
        _ => Err("invalid color choice (allowed values: never|auto|always)"),
    }
}

impl Args {
    pub(crate) fn stdout_color(&self) -> ColorChoice {
        self.color
    }

    pub(crate) fn stderr_color(&self) -> ColorChoice {
        self.color
    }
}
