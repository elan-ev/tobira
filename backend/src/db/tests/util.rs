use std::{ops::Deref, collections::HashSet};
use secrecy::ExposeSecret;
use tokio_postgres::{Client, NoTls};

use crate::{prelude::*, db::types::Key, search::IndexItemKind};
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

    pub(super) async fn add_realm(
        &self,
        name: &str,
        parent: Key,
        path_segment: &str,
    ) -> Result<Key> {
        let row = self.query_one(
            "insert into realms (name, parent, path_segment) values ($1, $2, $3) returning id",
            &[&name, &parent, &path_segment],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(super) async fn add_event(
        &self,
        title: &str,
        duration: u32,
        opencast_id: &str,
        series: Option<Key>,
    ) -> Result<Key> {
        let sql = "insert into events
            (state, opencast_id, title, series, is_live, read_roles, write_roles, created,
                updated, metadata, duration, tracks, captions, segments)
            values
            ('ready', $1, $2, $3, false, '{ROLE_ANONYMOUS}', '{ROLE_ANONYMOUS}',
                now(), now(), '{}', $4,
                array[row(
                    'https://example.org/video.mp4',
                    'presenter/preview',
                    'video/mp4',
                    '{1280, 720}',
                    true
                )]::event_track[],
             '{}', '{}'
            )
            returning id";

        let row = self.query_one(sql, &[&opencast_id, &title, &series, &(duration as i64)]).await?;
        Ok(row.get(0))
    }

    pub(super) async fn add_series(
        &self,
        title: &str,
        opencast_id: &str,
    ) -> Result<Key> {
        let row = self.query_one(
            "insert into series
                (state, title, opencast_id, read_roles, write_roles, updated)
                values
                ('ready', $1, $2, '{}', '{}', now())
                returning id",
            &[&title, &opencast_id],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(super) async fn add_playlist(
        &self,
        title: &str,
        opencast_id: &str,
        entry_keys: &[Key],
    ) -> Result<Key> {
        let opencast_ids = self.query(
            "select opencast_id from events where id = any($1)",
            &[&entry_keys],
        ).await?;

        let entries = opencast_ids.into_iter()
            .enumerate()
            .map(|(i, row)| crate::db::types::PlaylistEntry {
                entry_id: i as i64,
                ty: crate::db::types::PlaylistEntryType::Event,
                content_id: row.get::<_, String>(0),
            })
            .collect::<Vec<_>>();
        let row = self.query_one(
            "insert into playlists
                (opencast_id, title, entries, read_roles, write_roles, updated)
                values
                ($1, $2, $3, '{}', '{}', now())
                returning id",
            &[&opencast_id, &title, &entries],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(super) async fn add_video_block(&self, realm: Key, video: Key, index: u8) -> Result<Key> {
        let row = self.query_one(
            "insert into blocks (realm, index, type, video, show_title)
                values ($1, $2, 'video', $3, true)
                returning id",
            &[&realm, &(index as i16), &video],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(super) async fn add_series_block(&self, realm: Key, series: Key, index: u8) -> Result<Key> {
        let row = self.query_one(
            "insert into blocks (realm, index, type, series, show_title, videolist_order, videolist_layout)
                values ($1, $2, 'series', $3, true, 'new_to_old', 'gallery')
                returning id",
            &[&realm, &(index as i16), &series],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(super) async fn add_playlist_block(&self, realm: Key, playlist: Key, index: u8) -> Result<Key> {
        let row = self.query_one(
            "insert into blocks (realm, index, type, playlist, show_title, videolist_order, videolist_layout)
                values ($1, $2, 'playlist', $3, true, 'new_to_old', 'gallery')
                returning id",
            &[&realm, &(index as i16), &playlist],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(super) async fn search_queue(&self) -> Result<HashSet<(Key, IndexItemKind)>> {
        self.query_raw("select item_id, kind from search_index_queue", dbargs![])
            .await?
            .map_ok(|row| (row.get(0), row.get(1)))
            .try_collect::<HashSet<_>>()
            .await
            .map_err(Into::into)
    }

    pub(super) async fn clear_search_queue(&self) -> Result<()> {
        self.execute("truncate search_index_queue", &[]).await?;
        Ok(())
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
