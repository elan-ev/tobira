//! This module defines the command line arguments Tobira accepts.

use std::path::PathBuf;

use crate::{cmd, db::cmd::DbCommand, search::cmd::SearchIndexCommand};


#[derive(Debug, clap::Parser)]
#[clap(about = "Video portal for Opencast.")]
pub(crate) struct Args {
    #[clap(subcommand)]
    pub(crate) cmd: Command,
}

#[derive(Debug, clap::Parser)]
pub(crate) enum Command {
    /// Starts the backend HTTP server.
    Serve {
        #[clap(flatten)]
        shared: Shared,
    },

    /// Synchronizes Tobira with the configured Opencast instance.
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
}

#[derive(Debug, clap::Args)]
pub(crate) struct Shared {
    /// Path to the configuration file. If this is not specified, Tobira will
    /// try opening the path inside `TOBIRA_CONFIG_PATH`, `config.toml` or
    /// `/etc/tobira/config.toml`.
    #[clap(short, long)]
    pub(crate) config: Option<PathBuf>,
}
