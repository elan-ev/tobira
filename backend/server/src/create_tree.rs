//! CLI command `create-tree` to read a realm tree from a YAML file and store it
//! in the DB.

use anyhow::Result;
use serde::Deserialize;
use tokio_postgres::GenericClient;
use std::{fs::File, future::Future, path::Path, pin::Pin};

use tobira_util::prelude::*;
use crate::{config::Config, db};


#[derive(Debug, Deserialize)]
struct Realm {
    path: String,
    name: String,

    #[serde(default)]
    blocks: Vec<Block>,

    #[serde(default)]
    children: Vec<Realm>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Block {
    Text {
        #[serde(default)]
        title: String,
        body: String,
    },
    Series {
        title: String,
        series_uuid: Option<String>,
        series_title: Option<String>,
    }
}


pub(crate) async fn run(path: &Path, config: &Config) -> Result<()> {
    let file = File::open(path)?;
    let root: Realm = serde_yaml::from_reader(file)?;

    // Open DB connection, check consistency and migrate if necessary.
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;

    insert_realm(&**db.get().await?, &root, 0).await
}

// Recursive async functions have to be written manually, unfortunately.
fn insert_realm<'a>(
    db: &'a impl GenericClient,
    realm: &'a Realm,
    id: i64,
) -> Pin<Box<dyn 'a + Future<Output = Result<()>>>> {
    Box::pin(async move {
        // Insert all blocks
        for (i, block) in realm.blocks.iter().enumerate() {
            match block {
                Block::Text { title, body } => {
                    let query = "
                        insert into blocks (realm_id, type, index, title, text_content)
                        values ($1, 'text', $2, $3, $4)
                    ";
                    db.execute(query, &[&id, &(i as i16), title, body]).await?;
                }
                Block::Series { title, series_title, series_uuid } => {
                    // Obtain the series ID
                    let series_id = match (series_title, series_uuid) {
                        (Some(title), None) => {
                            let rows = db
                                .query("select id from series where title = $1", &[title])
                                .await?;
                            if rows.is_empty() {
                                warn!("Series with title '{}' not found! Skipping.", title);
                            }
                            rows[0].get::<_, i64>(0)
                        }
                        (None, Some(uuid)) => {
                            let rows = db
                                .query("select id from series where opencast_id = $1", &[uuid])
                                .await?;
                            if rows.is_empty() {
                                warn!("Series with UUID '{}' not found! Skipping.", uuid);
                            }
                            rows[0].get::<_, i64>(0)
                        }
                        _ => bail!("exactly one of `series_title` and `series_uuid` has to be set"),
                    };

                    // Insert block
                    let query = "
                        insert into blocks
                        (realm_id, type, index, title, series_id, videolist_layout, videolist_order)
                        values ($1, 'series', $2, $3, $4, 'grid', 'new_to_old')
                    ";
                    db.execute(query, &[&id, &(i as i16), title, &series_id]).await?;
                }
            }
        }

        // Insert all children and recurse
        for child in &realm.children {
            let query = "
                insert into realms (parent, name, path_segment)
                values ($1, $2, $3)
                returning id";
            let row = db.query_one(query, &[&id, &child.name, &child.path]).await?;
            let child_id = row.get::<_, i64>(0);
            insert_realm(db, child, child_id).await?;
        }

        Ok(())
    })
}
