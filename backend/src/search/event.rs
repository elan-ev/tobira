use meilisearch_sdk::{document::Document, tasks::Task, indexes::Index};
use serde::{Serialize, Deserialize};
use tokio_postgres::{Row, GenericClient};

use crate::{
    prelude::*,
    db::{DbConnection, types::Key, util::collect_rows_mapped},
};

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

impl Event {
    const SQL_SELECT_FIELDS: &'static str = "\
        events.id, \
        events.series, series.title, \
        events.title, events.description, events.creators, \
        events.thumbnail, events.duration, \
        events.read_roles, events.write_roles\
    ";

    /// Converts a row to `Self` when the query selected `SQL_SELECT_FIELDS`.
    fn from_row(row: Row) -> Self {
        Self {
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
    }

    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let query = format!(
            "select {} from events \
                left join series on events.series = series.id \
                where events.id = any($1)",
            Self::SQL_SELECT_FIELDS,
        );
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, Self::from_row).await.map_err(Into::into)
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let query = format!(
            "select {} from events left join series on events.series = series.id",
            Self::SQL_SELECT_FIELDS,
        );
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, Self::from_row).await.map_err(Into::into)
    }
}

pub(super) async fn rebuild(meili: &Client, db: &DbConnection) -> Result<Task> {
    let events = Event::load_all(&***db).await?;
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
