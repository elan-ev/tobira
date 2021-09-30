//! CLI command `import-realm-tree` to read a realm tree from a YAML file and
//! store it in the DB.

use serde::Deserialize;
use tokio_postgres::GenericClient;
use std::{fs::File, future::Future, path::PathBuf, pin::Pin};
use structopt::StructOpt;

use crate::{
    config::Config,
    db::{self, util::NoParams},
    prelude::*,
};


#[derive(Debug, StructOpt)]
pub(crate) struct Args {
    /// YAML file specifying the realm tree.
    input_file: PathBuf,

    /// Add dummy blocks to realms without any blocks.
    #[structopt(long)]
    dummy_blocks: bool,
}


#[derive(Debug, Deserialize)]
struct Realm {
    path: String,
    name: String,

    #[serde(default)]
    blocks: Vec<Block>,

    #[serde(default)]
    children: Vec<Realm>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
enum Block {
    Text {
        #[serde(default)]
        title: Option<String>,
        body: String,
    },
    Series {
        title: Option<String>,
        series_uuid: Option<String>,
        series_title: Option<String>,
    }
}


pub(crate) async fn run(args: &Args, config: &Config) -> Result<()> {
    let file = File::open(&args.input_file)?;
    let root: Realm = serde_yaml::from_reader(file)?;
    info!("Read YAML file");

    // Open DB connection, check consistency and migrate if necessary.
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;
    let conn = &**db.get().await?;

    let mut dummy_blocks = DummyBlocks::new(args.dummy_blocks, conn).await?;

    info!("Starting to insert realms into the DB...");
    insert_realm(conn, &root, 0, &mut dummy_blocks).await?;
    info!("Done inserting realms");

    Ok(())
}

// Recursive async functions have to be written manually, unfortunately.
fn insert_realm<'a>(
    db: &'a impl GenericClient,
    realm: &'a Realm,
    id: i64,
    dummy_blocks: &'a mut DummyBlocks,
) -> Pin<Box<dyn 'a + Future<Output = Result<()>>>> {
    Box::pin(async move {
        // Insert all blocks
        let blocks = if realm.blocks.is_empty() {
            dummy_blocks.next_blocks()
        } else {
            Box::new(realm.blocks.iter().cloned())
        };

        for (i, block) in blocks.enumerate() {
            block.insert(id, i, db).await?;
        }

        // Insert all children and recurse
        for child in &realm.children {
            let query = "
                insert into realms (parent, name, path_segment)
                values ($1, $2, $3)
                returning id";
            let row = db.query_one(query, &[&id, &child.name, &child.path]).await?;
            let child_id = row.get::<_, i64>(0);
            insert_realm(db, child, child_id, dummy_blocks).await?;
        }

        Ok(())
    })
}


enum DummyBlocks {
    Disabled,
    Enabled {
        series: Vec<String>,
        idx: usize,
    },
}

impl DummyBlocks {
    async fn new(enable: bool, db: &impl GenericClient) -> Result<Self> {
        if enable {
            let series = db.query_raw("select opencast_id from series", NoParams)
                .await?
                .map_ok(|row| row.get::<_, String>(0))
                .try_collect()
                .await?;

            Ok(Self::Enabled {
                series,
                idx: 0,
            })
        } else {
            Ok(Self::Disabled)
        }
    }

    fn next_blocks(&mut self) -> Box<dyn Iterator<Item = Block>> {
        match self {
            Self::Disabled => Box::new(std::iter::empty()),
            Self::Enabled { series, idx } => {
                let uuid = series[*idx].clone();
                *idx = (*idx + 1) % series.len();

                Box::new(IntoIterator::into_iter([
                    Block::Text {
                        title: None,
                        body: DUMMY_TEXT.into(),
                    },
                    Block::Series {
                        title: None,
                        series_title: None,
                        series_uuid: Some(uuid)
                    },
                ]))
            }
        }
    }
}

impl Block {
    async fn insert(&self, realm_id: i64, index: usize, db: &impl GenericClient) -> Result<()> {
        match self {
            Block::Text { title, body } => {
                let query = "
                    insert into blocks (realm_id, type, index, title, text_content)
                    values ($1, 'text', $2, $3, $4)
                ";
                db.execute(query, &[&realm_id, &(index as i16), title, body]).await?;
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
                db.execute(query, &[&realm_id, &(index as i16), title, &series_id]).await?;
            }
        }

        Ok(())
    }
}

const DUMMY_TEXT: &str = "\
    The videos you see below have nothing to do with the name of this page. They \
    have been randomly assigned.\n\
    \n\
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor \
    incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud \
    exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute \
    irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla \
    pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia \
    deserunt mollit anim id est laborum.";
