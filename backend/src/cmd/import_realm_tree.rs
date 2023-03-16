//! CLI command `import-realm-tree` to read a realm tree from a YAML file and
//! store it in the DB.

use serde::Deserialize;
use tokio_postgres::GenericClient;
use std::{fs::File, future::Future, path::PathBuf, pin::Pin, collections::HashMap};
use rand::{thread_rng, Rng, distributions::WeightedIndex, prelude::*};

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
    Series {
        series: Series,
        show_title: bool,
        show_description: bool,
    },
    Video(i64),
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
enum Series {
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
        info!("Generating dummy blocks...");
        add_dummy_blocks(&mut root, &**conn).await?;
    }
    
    info!("Starting to insert realms into the DB...");
    insert_realm(&**conn, &root, 0).await?;
    info!("Done inserting realms");

    Ok(())
}

/// Visits all empty realms in the given tree recursively and calls `f` for each realm.
fn for_all_empty_realms(realm: &mut Realm, mut f: impl FnMut(&mut Realm)) {
    fn for_all_realms_rec(realm: &mut Realm, f: &mut impl FnMut(&mut Realm)) {
        if realm.blocks.is_empty() {
            f(realm);
        }
            
        for child in &mut realm.children {
            for_all_realms_rec(child, f);
        }
    }
    
    for_all_realms_rec(realm, &mut f);
}

/// Adds different kinds of blocks to empty realms.
async fn add_dummy_blocks(root: &mut Realm, db: &impl GenericClient) -> Result<()> {
    let mut rng = thread_rng();

    // Load all series from the DB and store them in a hashmap that maps from
    // series title to a list of series UUIDS with that title. We need this data
    // structure below.
    let series_rows = db.query("select title, opencast_id from series", &[]).await?;
    let mut series = <HashMap<_, Vec<_>>>::new();

    for row in series_rows {
        let Some(title) = row.get::<_, Option<String>>("title") else {
            continue;
        };
        let oc_id = row.get::<_, String>("opencast_id");
        series.entry(title).or_default().push(oc_id);
    }

    // Load the IDs of all events to randomly select from them below.
    let event_rows = db.query("select id from events", &[]).await?;
    let events = event_rows.into_iter()
        .map(|row| row.get::<_,i64>("id"))
        .collect::<Vec<_>>();

    // Insert series blocks into realms where a series with the same name as the
    // realm can be found. Those (used) series are removed from the hashmap.
    for_all_empty_realms(root, |realm| {
        // TODO: derive realm name from series block
        // TODO: Don't show title, but do show description
        if let Some(uuids) = series.get_mut(&realm.name) {
            // We can `unwrap` here because in the lines below,
            // we make sure that there are no empty vectors in the hashmap.
            let series_uuid = uuids.pop().unwrap();
            if uuids.is_empty() {
                series.remove(&realm.name);
            }
            realm.blocks.push(Block::Series {
                series: Series::ByUuid(series_uuid),
                show_title: false,
                show_description: true,
            });
        }
    });

    // Determine number of remaining realms.
    let mut number_of_remaining_realms = 0;
    for_all_empty_realms(root, |_| {
        number_of_remaining_realms += 1;
    });

    // Store all remaining series IDs in a vector as this makes it easier
    // to randomly select one below.
    let series = series.into_values().flatten().collect::<Vec<_>>();
    let series_probability = (series.len() as f32 / number_of_remaining_realms as f32).min(0.95);
    
    // Insert blocks into remaining realms.
    for_all_empty_realms(root, |realm| {
        // Text blocks:
        let num_text_blocks = {
            let choices = [0, 1, 2];
            let weights = [3, 6, 1];
            let dist = WeightedIndex::new(&weights).unwrap();
            choices[dist.sample(&mut rng)]
        };
        let text_block = Block::Text(dummy_text(&realm.name));
        // Add a number of text blocks according to the above distribution.
        realm.blocks.extend(std::iter::repeat(text_block).take(num_text_blocks));

        // Series blocks:
        if rand::random::<f32>() < series_probability {
            let uuid = series.choose(&mut rng);
            realm.blocks.extend(
                uuid.map(|uuid| Block::Series {
                    series: Series::ByUuid(uuid.to_owned()),
                    show_title: true,
                    show_description: rand::random(),
                })
            );
        }
        // Video blocks:
        let num_video_blocks = {
            let choices = [0, 1, 2, 3];
            let weights = [30, 50, 15, 5];
            let dist = WeightedIndex::new(&weights).unwrap();
            choices[dist.sample(&mut rng)]
        };
        // Add between 0 and 3 video blocks according to above distribution.
        for _ in 0..num_video_blocks {
            let id = events.choose(&mut rng);
            realm.blocks.extend(id.map(|id| Block::Video(*id)));
        }

        // Shuffle blocks.
        realm.blocks.shuffle(&mut rng);
    });

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
            Block::Series { series, show_title, show_description } => {
                // Obtain the series ID
                let series_id = match series {
                    Series::ByTitle(title) => {
                        let rows = db
                            .query("select id from series where title = $1", &[title])
                            .await?;
                        if rows.is_empty() {
                            warn!("Series with title '{}' not found! Skipping.", title);
                            return Ok(());
                        }
                        rows[0].get::<_, i64>(0)
                    }
                    Series::ByUuid(uuid) => {
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
                    (realm, type, index, series, videolist_order, show_title, show_metadata)
                    values ($1, 'series', $2, $3, 'new_to_old', $4, $5)
                ";
                db.execute(
                    query,
                    &[&realm_id, &(index as i16), &series_id, &show_title, &show_description],
                ).await?;
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

    let num_sentences = DUMMY_TEXT.chars().filter(|c| c == &'.').count();
    let num = thread_rng().gen_range(1..num_sentences);
    let end_index = DUMMY_TEXT.char_indices().filter(|(_, c)| c == &'.').nth(num).unwrap().0;
    let text = &DUMMY_TEXT[..=end_index];
    
    let num = num + 1; // 0-based to 1-based
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

