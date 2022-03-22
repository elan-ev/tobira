use meilisearch_sdk::{document::Document, tasks::Task, indexes::Index};
use serde::{Serialize, Deserialize};

use crate::{prelude::*, db::DbConnection};

use super::Client;



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Event {
    pub(crate) id: i64,
    pub(crate) series_id: Option<i64>,
    pub(crate) series_title: Option<String>,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) creators: Vec<String>,
    pub(crate) thumbnail: Option<String>,
    pub(crate) duration: i32,
}

impl Document for Event {
   type UIDType = i64;
   fn get_uid(&self) -> &Self::UIDType {
       &self.id
   }
}

pub(super) async fn rebuild(meili: &Client, db: &DbConnection) -> Result<Task> {
    let query = "select events.id, events.series, series.title, \
        events.title, events.description, creators, thumbnail, duration \
        from events \
        left join series on events.series = series.id";
    let events = db.query_raw(query, dbargs![])
        .await?
        .map_ok(|row| {
            Event {
                id: row.get(0),
                series_id: row.get(1),
                series_title: row.get(2),
                title: row.get(3),
                description: row.get(4),
                creators: row.get(5),
                thumbnail: row.get(6),
                duration: row.get(7),
            }
        })
        .try_collect::<Vec<_>>()
        .await?;
    debug!("Loaded {} events from DB", events.len());

    let task = meili.event_index.add_documents(&events, None).await?;
    debug!("Sent {} events to Meili for indexing", events.len());

    Ok(task)
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    index.set_searchable_attributes(["title", "creators", "description", "series_title"]).await?;

    Ok(())
}
