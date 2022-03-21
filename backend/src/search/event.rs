use meilisearch_sdk::{document::Document, tasks::Task};
use serde::{Serialize, Deserialize};

use crate::{prelude::*, db::DbConnection};

use super::Client;



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Event {
    pub(crate) id: i64,
    pub(crate) opencast_id: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) creators: Vec<String>,
    pub(crate) thumbnail: Option<String>,
}

impl Document for Event {
   type UIDType = i64;
   fn get_uid(&self) -> &Self::UIDType {
       &self.id
   }
}

pub(super) async fn rebuild(meili: &Client, db: &DbConnection) -> Result<Task> {
    let query = "select \
        id, opencast_id, title, description, creators, thumbnail \
        from events";
    let events = db.query_raw(query, dbargs![])
        .await?
        .map_ok(|row| {
            Event {
                id: row.get(0),
                opencast_id: row.get(1),
                title: row.get(2),
                description: row.get(3),
                creators: row.get(4),
                thumbnail: row.get(5),
            }
        })
        .try_collect::<Vec<_>>()
        .await?;
    debug!("Loaded {} events from DB", events.len());

    let task = meili.event_index.add_documents(&events, None).await?;
    debug!("Sent {} events to Meili for indexing", events.len());

    Ok(task)
}
