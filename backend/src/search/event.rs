use chrono::{DateTime, Utc};
use meilisearch_sdk::{document::Document, indexes::Index};
use serde::{Serialize, Deserialize};
use tokio_postgres::GenericClient;

use crate::{
    prelude::*,
    db::{types::Key, util::{collect_rows_mapped, impl_from_db}},
};

use super::{realm::Realm, SearchId, IndexItem, IndexItemKind, util};



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
    pub(crate) created: DateTime<Utc>,
    pub(crate) is_live: bool,

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

    // The `listed` field is always `!host_realms.is_empty()`, but we need to
    // store it explicitly to filter for this condition in Meili.
    pub(crate) listed: bool,
    pub(crate) host_realms: Vec<Realm>,
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

impl_from_db!(
    Event,
    "search_events",
    {
        id, series, series_title, title, description, creators, thumbnail,
        duration, is_live, created, read_roles, write_roles, host_realms,
    },
    |row| {
        let host_realms = row.host_realms::<Vec<Realm>>();
        Self {
            id: row.id(),
            series_id: row.series(),
            series_title: row.series_title(),
            title: row.title(),
            description: row.description(),
            creators: row.creators(),
            thumbnail: row.thumbnail(),
            duration: row.duration(),
            is_live: row.is_live(),
            created: row.created(),
            read_roles: util::encode_acl(&row.read_roles::<Vec<String>>()),
            write_roles: util::encode_acl(&row.write_roles::<Vec<String>>()),
            listed: !host_realms.is_empty(),
            host_realms,
        }
    }
);

impl Event {
    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let (selection, mapping) = Self::select();
        let query = format!("select {selection} from search_events where id = any($1)");
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, |row| Self::from_row(&row, mapping))
            .await
            .context("failed to load events from DB")
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let (selection, mapping) = Self::select();
        let query = format!("select {selection} from search_events");
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, |row| Self::from_row(&row, mapping))
            .await
            .context("failed to load events from DB")
    }
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(
        index,
        "event",
        &["title", "creators", "description", "series_title"],
        &["listed", "read_roles", "write_roles"],
    ).await
}
