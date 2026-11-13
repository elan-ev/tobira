use std::{ops::Deref, collections::HashSet};
use tokio_postgres::{Client, NoTls};

use crate::{prelude::*, model::Key, search::IndexItemKind};


/// Env variable to set a Postgres URL to be used by tests. The temporary test
/// DBs are created via that connection.
const DB_URL_ENV: &str = "TOBIRA_TEST_DB";

/// Used if `DB_URL_ENV` is not set.
const DEFAULT_DB_URL: &str = "postgres://tobira:tobira@localhost:5432/tobira";


async fn conn(config: &tokio_postgres::Config) -> Result<Client> {
    let (client, connection) = config.connect(NoTls)
        .await
        .context("could not connect to DB in test")?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PG connection error: {e}");
        }
    });

    Ok(client)
}

/// A temporary DB used for a single unit test. Is removed on drop.
///
/// Use exactly one `TestDb` per test and keep it alive until the end of the
/// test. The connection to the temporary DB is not closed properly on drop,
/// so dropping it earlier prints a connection error.
pub(crate) struct TestDb {
    client: Client,
    config: tokio_postgres::Config,
    db_name: String,
}

impl TestDb {
    /// Creates a new temporary database on the server configured via
    /// `DB_URL_ENV`.
    pub(crate) async fn new() -> Result<Self> {
        let url = std::env::var(DB_URL_ENV).unwrap_or_else(|_| DEFAULT_DB_URL.into());
        let mut config = url.parse::<tokio_postgres::Config>()
            .with_context(|| format!("invalid Postgres URL in ${DB_URL_ENV}"))?;
        config.application_name("Tobira DB tests");

        // Connect to original database and create a new temporary one.
        let db_name = format!("tobira_test_{}", rand::random::<u64>());
        conn(&config).await?
            .execute(&format!("create database {db_name}"), &[]).await
            .context("failed to create temporary test DB")?;

        // Connect to temporary database
        let client = conn(config.clone().dbname(&db_name)).await?;

        Ok(Self { client, config, db_name })
    }

    pub(crate) async fn with_migrations() -> Result<Self> {
        let mut out = Self::new().await?;
        crate::db::migrate(&mut out.client).await
            .context("failed to run migrations on test DB")?;

        Ok(out)
    }

    pub(crate) async fn add_realm(
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

    pub(crate) async fn add_event(
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

    pub(crate) async fn add_series(
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

    pub(crate) async fn add_playlist(
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

    pub(crate) async fn add_video_block(&self, realm: Key, video: Key, index: u8) -> Result<Key> {
        let row = self.query_one(
            "insert into blocks (realm, index, type, video, show_title)
                values ($1, $2, 'video', $3, true)
                returning id",
            &[&realm, &(index as i16), &video],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(crate) async fn add_series_block(&self, realm: Key, series: Key, index: u8) -> Result<Key> {
        let row = self.query_one(
            "insert into blocks (realm, index, type, series, show_title, videolist_order, videolist_layout)
                values ($1, $2, 'series', $3, true, 'new_to_old', 'gallery')
                returning id",
            &[&realm, &(index as i16), &series],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(crate) async fn add_playlist_block(&self, realm: Key, playlist: Key, index: u8) -> Result<Key> {
        let row = self.query_one(
            "insert into blocks (realm, index, type, playlist, show_title, videolist_order, videolist_layout)
                values ($1, $2, 'playlist', $3, true, 'new_to_old', 'gallery')
                returning id",
            &[&realm, &(index as i16), &playlist],
        ).await?;
        Ok(row.get::<_, Key>(0))
    }

    pub(crate) async fn search_queue(&self) -> Result<HashSet<(Key, IndexItemKind)>> {
        self.query_raw("select item_id, kind from search_index_queue", dbargs![])
            .await?
            .map_ok(|row| (row.get(0), row.get(1)))
            .try_collect::<HashSet<_>>()
            .await
            .map_err(Into::into)
    }

    pub(crate) async fn clear_search_queue(&self) -> Result<()> {
        self.execute("truncate search_index_queue", &[]).await?;
        Ok(())
    }
}

impl Deref for TestDb {
    type Target = Client;

    fn deref(&self) -> &Self::Target {
        &self.client
    }
}

impl Drop for TestDb {
    fn drop(&mut self) {
        // Since there is no "async drop" in Rust yet, this is a bit annoying.
        // We cannot run async code on the test's runtime from in here (with
        // the current thread runtime, nothing else would run while we block).
        // So we connect again from a separate thread with its own runtime.
        // `with (force)` terminates the connection of `self.client`, which
        // cannot be closed properly from here either.
        let config = self.config.clone();
        let db_name = self.db_name.clone();
        let _ = std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("failed to create Tokio runtime");
            let result = rt.block_on(async {
                conn(&config).await?
                    .execute(&format!("drop database {db_name} with (force)"), &[]).await
                    .context("failed to execute 'drop database'")
            });
            if let Err(e) = result {
                eprintln!("WARNING: failed to drop temporary test DB '{db_name}': {e:#}");
            }
        }).join();
    }
}
