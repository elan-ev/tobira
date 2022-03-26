use meilisearch_sdk::{document::Document, tasks::Task, indexes::Index};
use serde::{Serialize, Deserialize};

use crate::{prelude::*, db::{DbConnection, types::Key}};

use super::{Client, SearchId, encode_acl, lazy_set_special_attributes, IndexItem, IndexItemKind};



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Event {
    pub(crate) id: SearchId,
    pub(crate) series_id: Option<SearchId>,
    pub(crate) series_title: Option<String>,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) creators: Vec<String>,
    pub(crate) thumbnail: Option<String>,
    pub(crate) duration: i32,

    // These are filterable. All roles are hex encoded to work around Meilis
    // inability to filter case-sensitively. For roles, we have to compare
    // case-sensitively. Encoding as hex is one possibility. There likely also
    // exists a more compact encoding, but hex is good for now.
    //
    // Alternatively, one could also let Meili do the case-insensitive checking
    // and do another check in our backend, case-sensitive. That could work if
    // we just assume that the cases where this matters are very rare. And in
    // those cases we just accept that our endpoint returns fewer than X
    // items.
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,
}

impl Document for Event {
   type UIDType = SearchId;
   fn get_uid(&self) -> &Self::UIDType {
       &self.id
   }
}

impl IndexItem for Event {
    const KIND: IndexItemKind = IndexItemKind::Event;
}

pub(super) async fn rebuild(meili: &Client, db: &DbConnection) -> Result<Task> {
    let query = "select events.id, events.series, series.title, \
        events.title, events.description, creators, thumbnail, duration, \
        read_roles, write_roles \
        from events \
        left join series on events.series = series.id";
    let events = db.query_raw(query, dbargs![])
        .await?
        .map_ok(|row| {
            Event {
                id: SearchId(row.get(0)),
                series_id: row.get::<_, Option<Key>>(1).map(SearchId),
                series_title: row.get(2),
                title: row.get(3),
                description: row.get(4),
                creators: row.get(5),
                thumbnail: row.get(6),
                duration: row.get(7),
                read_roles: encode_acl(&row.get::<_, Vec<String>>(8)),
                write_roles: encode_acl(&row.get::<_, Vec<String>>(9)),
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
    lazy_set_special_attributes(
        index,
        "event",
        &["title", "creators", "description", "series_title"],
        &["read_roles", "write_roles"],
    ).await
}
