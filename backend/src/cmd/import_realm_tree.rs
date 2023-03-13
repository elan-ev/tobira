//! CLI command `import-realm-tree` to read a realm tree from a YAML file and
//! store it in the DB.

use serde::Deserialize;
use tokio_postgres::GenericClient;
use std::{fs::File, future::Future, path::PathBuf, pin::Pin, collections::HashMap};
use rand::{thread_rng, Rng};

use crate::{
    config::Config,
    db,
    prelude::*,
};


#[derive(Debug, clap::Args)]
pub(crate) struct Args {
    /// YAML file specifying the realm tree.
    input_file: PathBuf,

    /// Add dummy blocks to realms without any blocks.
    #[clap(long)]
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
    Title(String),
    Text(String),
    Series(SeriesBlock),
    Video(i64),
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
enum SeriesBlock {
    ByUuid(String),
    ByTitle(String),
}

pub(crate) async fn run(args: &Args, config: &Config) -> Result<()> {
    let file = File::open(&args.input_file)?;
    let mut root: Realm = serde_yaml::from_reader(file)?;
    info!("Read YAML file");

    // Open DB connection, check consistency and migrate if necessary.
    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;
    let conn = db.get().await?;

    if args.dummy_blocks {
        add_dummy_blocks(&mut root, &**conn).await?;
    }
    
    info!("Starting to insert realms into the DB...");
    insert_realm(&**conn, &root, 0).await?;
    info!("Done inserting realms");

    Ok(())
}

fn for_all_realms(realm: &mut Realm, mut f: impl FnMut(&mut Realm)) {
    fn add_blocks(realm: &mut Realm, f: &mut impl FnMut(&mut Realm)) {
        f(realm);

        for child in &mut realm.children {
            add_blocks(child, f);
        }
    }

    add_blocks(realm, &mut f);
}

async fn add_dummy_blocks(root: &mut Realm, db: &impl GenericClient) -> Result<()> {
    // Get relevant series fields.
    let series_rows = db.query("select title, opencast_id from series", &[]).await?;
    let mut series = <HashMap<_, Vec<_>>>::new();

    // Store fields in hashmap and make a copy of that.
    for row in series_rows {
        let Some(title) = row.get::<_, Option<String>>("title") else {
            continue;
        };
        let oc_id = row.get::<_, String>("opencast_id");

        series.entry(title).or_default().push(oc_id);
    }
    let mut series_copy = series.clone();

    // Get relevant event fields. `part_of` is used to match events to their series.
    let event_rows = db.query("select id, part_of from events", &[]).await?;
    let mut events = <HashMap<_, Vec<_>>>::new();

    // Store fields in hashmap and make a copy.
    for row in event_rows {
        let id = row.get::<_, i64>("id");
        let part_of = row.get::<_, Option<String>>("part_of");
        events.entry(part_of).or_default().push(id);
    }

    // Recursive functions to populate realms and children realms:
    // Insert text blocks
    for_all_realms(root, |realm|
        if !realm.blocks.iter().any(|block| matches!(block, Block::Text(_))) {
            realm.blocks.push(Block::Text(dummy_text(&realm.name)));
        }
    );
    
    // Insert series blocks
    for_all_realms(root, |realm|
        if let Some(uuids) = series.get_mut(&realm.name) {
            // We can `unwrap` here because in the lines below,
            // we make sure that there are no empty vectors in the hashmap.
            let series_uuid = uuids.pop().unwrap();
            if uuids.is_empty() {
                series.remove(&realm.name);
            }
            realm.blocks.push(Block::Series(SeriesBlock::ByUuid(series_uuid)));
        }
    );

    // Insert remaining series
    for_all_realms(root, |realm|
        if !realm.blocks.iter().any(|block| matches!(block, Block::Series(_))) {
            if let Some((title, uuids)) = series.iter_mut().next() {
                let uuid = uuids.pop().unwrap();
                let copy = title.clone();
                if uuids.is_empty() {
                    series.remove(&copy);
                }
                // Only insert series if it is not empty,
                // i.e. `events` map contains a `part_of` key for that series.
                if events.contains_key(&Some(uuid.clone())) {
                    realm.blocks.push(Block::Series(SeriesBlock::ByUuid(uuid)));
                }
            }
        }
    );

    // Insert video blocks
    for_all_realms(root, |realm|
        if let Some(uuids) = series_copy.get_mut(&realm.name) {
            let series_uuid = uuids.pop().unwrap();
            let copy = series_uuid.clone();
            if uuids.is_empty() {
                series_copy.remove(&realm.name);
            }
    
            // Look for events that are `part_of` series with `series_uuid`
            if let Some(event_ids) = events.get_mut(&Some(series_uuid)) {
                // Insert a random number of these
                let num = if event_ids.len() < 4 {
                    thread_rng().gen_range(0..=event_ids.len())
                } else {
                    thread_rng().gen_range(0..4)
                };
                for event_id in event_ids.drain(..num) {
                    realm.blocks.push(Block::Video(event_id));
                }
                if event_ids.is_empty() {
                    events.remove(&Some(copy));
                }
            }
        }
    );

    // Insert remaining videos
    for_all_realms(root, |realm|
        // See if realm already has at least one video block.
        // If not: insert one that hasn't been inserted yet.
        if !realm.blocks.iter().any(|block| matches!(block, Block::Video(_))) {
            if !events.is_empty() {
                // Get a random key.
                let key = events.keys().next().unwrap().to_owned();
                // Insert a random number of events with that key.
                if let Some(event_ids) = events.get_mut(&key) {
                    let num = if event_ids.len() < 4 {
                        thread_rng().gen_range(0..=event_ids.len())
                    } else {
                        thread_rng().gen_range(0..4)
                    };
                    for event_id in event_ids.drain(..num) {
                        realm.blocks.push(Block::Video(event_id));
                    }
                    if event_ids.is_empty() {
                        events.remove(&key);
                    }
                }
            }
        }
    );

    Ok(())
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
            insert_realm(db, child, child_id).await?;
        }

        Ok(())
    })
}


impl Block {
    async fn insert(&self, realm_id: i64, index: usize, db: &impl GenericClient) -> Result<()> {
        match self {
            Block::Title(title) => {
                let query = "
                    insert into blocks (realm, type, index, text_content)
                    values ($1, 'title', $2, $3)
                ";
                db.execute(query, &[&realm_id, &(index as i16), title]).await?;
            }
            Block::Text(text) => {
                let query = "
                    insert into blocks (realm, type, index, text_content)
                    values ($1, 'text', $2, $3)
                ";
                db.execute(query, &[&realm_id, &(index as i16), text]).await?;
            }
            Block::Video(event_id) => {
                let query = "
                    insert into blocks
                    (realm, type, index, video)
                    values ($1, 'video', $2, $3)
                ";
                db.execute(query, &[&realm_id, &(index as i16), &event_id]).await?;
            }
            Block::Series(series) => {
                // Obtain the series ID
                let series_id = match series {
                    SeriesBlock::ByTitle(title) => {
                        let rows = db
                            .query("select id from series where title = $1", &[title])
                            .await?;
                        if rows.is_empty() {
                            warn!("Series with title '{}' not found! Skipping.", title);
                            return Ok(());
                        }
                        rows[0].get::<_, i64>(0)
                    }
                    SeriesBlock::ByUuid(uuid) => {
                        let rows = db
                            .query("select id from series where opencast_id = $1", &[uuid])
                            .await?;
                        if rows.is_empty() {
                            warn!("Series with UUID '{}' not found! Skipping.", uuid);
                            return Ok(());
                        }
                        rows[0].get::<_, i64>(0)
                    }
                };

                // Insert block
                let query = "
                    insert into blocks
                    (realm, type, index, series, videolist_order, show_title)
                    values ($1, 'series', $2, $3, 'new_to_old', true)
                ";
                db.execute(query, &[&realm_id, &(index as i16), &series_id]).await?;
            }
        }

        Ok(())
    }
}

fn dummy_text(title: &str) -> String {
    const DUMMY_TEXT: &str = "\
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor \
        incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud \
        exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute \
        irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla \
        pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia \
        deserunt mollit anim id est laborum. Et sint libero id porro libero quo accusamus \
        saepe sed dolores inventore id ducimus iure sed consequatur modi. Eum atque tempore \
        et voluptas corporis et tempora quia sed rerum earum eos quia voluptate. Cum ullam \
        minima est nihil fugit quo nemo similique. Et omnis sequi hic aliquid ipsa eos \
        deleniti harum id obcaecati deserunt et omnis architecto non eligendi necessitatibus \
        sit similique ipsum.";
    // Split `DUMMY_TEXT` into sentences. We could also split this into words
    // and print a random amount of these, though the formatting would get a little
    // more tricky with that. Or we could use a library to generate the lorem text.

    // let sentences: Vec<_> = DUMMY_TEXT.split_inclusive(". ").collect();
    // let num = thread_rng().gen_range(1..sentences.len());

    let num_sentences = DUMMY_TEXT.chars().filter(|c| c == &'.').count();
    let num = thread_rng().gen_range(1..num_sentences);
    let end_index = DUMMY_TEXT.char_indices().filter(|(_, c)| c == &'.').nth(num).unwrap().0;
    let text = &DUMMY_TEXT[..=end_index];

    // // Build a string with a random number of lorem sentences.
    // let mut text = String::new();
    // for i in 1..=num {
    //     text.push_str(sentences[i])
    // }
    // let text = sentences.iter().take(num).collect::<String>();
    
    format!("\
        What you are seeing here is __{title}__, a collection of videos about potentially \
        very cool and interesting topics. \n\
        Note that the videos featured here might not have anything to do with the title \
        of this page. \n\
        Read on to learn more about this collection in no less than *{num}* sentences. \n\
        \n\
        {text}
        ")
}

