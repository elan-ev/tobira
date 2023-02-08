use std::ops::Deref;
use secrecy::ExposeSecret;
use tokio_postgres::{Client, NoTls};

use crate::prelude::*;
use super::DbConfig;


async fn conn(config: &super::DbConfig) -> Result<Client> {
    let (client, connection) = tokio_postgres::config::Config::new()
        .user(&config.user)
        .password(config.password.expose_secret())
        .dbname(&config.database)
        .host(&config.host)
        .port(config.port)
        .application_name("Tobira DB tests")
        .connect(NoTls)
        .await
        .context("could not connect to DB in test")?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            panic!("PG connection error: {e}");
        }
        println!("done with connection");
    });

    Ok(client)
}

/// A temporary DB used for a single unit test. Is removed on drop.
///
/// Be sure to use the multi threaded Tokio runtime or else `drop` will hang
/// indefinitely!
pub(super) struct TestDb {
    client: Option<Client>,
    controller: Client,
    db_name: String,
}

impl TestDb {
    /// Creates a new temporary database with connection data from the dev config.
    pub(super) async fn new() -> Result<Self> {
        let config = crate::Config::load_from("../util/dev-config/config.toml")
            .context("failed to load config")?;

        // Create connection to original database and create a new temporary one.
        let controller = conn(&config.db).await?;
        let db_name = format!("tobira_test_{}", rand::random::<u64>());
        controller.execute(&format!("create database {db_name}"), &[]).await
            .context("failed to create temporary test DB")?;

        // Connect to temporary database
        let client = conn(&DbConfig { database: db_name.clone(), ..config.db }).await?;

        Ok(Self {
            controller,
            client: Some(client),
            db_name
        })
    }

    pub(super) async fn with_migrations() -> Result<Self> {
        let mut out = Self::new().await?;
        crate::db::migrate(out.client.as_mut().unwrap()).await
            .context("failed to run migrations on test DB")?;

        Ok(out)
    }
}

impl Deref for TestDb {
    type Target = Client;

    fn deref(&self) -> &Self::Target {
        self.client.as_ref().unwrap()
    }
}

impl Drop for TestDb {
    fn drop(&mut self) {
        // Since there is no "async drop" in Rust yet, this is a bit annoying.
        // First we need to drop the client to close all connections to the
        // temporary database. Then we drop the database within `block_on`.
        //
        // This code requires the multi threaded Tokio runtime! :(
        drop(self.client.take());
        futures::executor::block_on(async move {
            self.controller.execute(&format!("drop database {}", self.db_name), &[])
                .await
                .expect("failed to drop temporary test DB");
        });
    }
}
