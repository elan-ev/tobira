use deadpool_postgres::Transaction;
use meilisearch_sdk::{document::Document, tasks::Task, indexes::Index};
use serde::{Serialize, Deserialize};
use tokio_postgres::{GenericClient, Row};

use crate::{prelude::*, db::{types::Key, util::collect_rows_mapped}};

use super::{Client, SearchId, IndexItem, IndexItemKind, util};


/// Representation of realms in the search index.
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Realm {
    pub(crate) id: SearchId,
    pub(crate) name: String,
    pub(crate) full_path: String,

    /// Includes the names of all ancestors, excluding the root and this realm
    /// itself. It starts with a direct child of the root and ends with the
    /// parent of `self`.
    pub(crate) ancestor_names: Vec<String>,
}

impl Document for Realm {
   type UIDType = SearchId;
   fn get_uid(&self) -> &Self::UIDType {
       &self.id
   }
}

impl IndexItem for Realm {
    const KIND: IndexItemKind = IndexItemKind::Realm;
}

impl Realm {
    const SQL_SELECT_FIELDS: &'static str = "\
        id, \
        name, \
        full_path, \
        ARRAY(select name from ancestors_of_realm(id) where height <> 0 offset 1)\
    ";

    /// Converts a row to `Self` when the query selected `SQL_SELECT_FIELDS`.
    fn from_row(row: Row) -> Self {
        Self {
            id: SearchId(row.get(0)),
            name: row.get(1),
            full_path: row.get(2),
            ancestor_names: row.get(3),
        }
    }

    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let query = format!("select {} from realms where id = any($1)", Self::SQL_SELECT_FIELDS);
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, Self::from_row).await.map_err(Into::into)
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let query = format!("select {} from realms", Self::SQL_SELECT_FIELDS);
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, Self::from_row).await.map_err(Into::into)
    }
}

/// Load all realms from the DB and store them in the index.
pub(super) async fn rebuild(meili: &Client, db: &Transaction<'_>) -> Result<Task> {
    // This nifty query gets all ancestors as array for each realm. We don't
    // include the root realm nor the realm itself in that array though.
    let realms = Realm::load_all(&**db).await?;
    debug!("Loaded {} realms from DB", realms.len());

    let task = meili.realm_index.add_documents(&realms, None).await?;
    debug!("Sent {} realms to Meili for indexing", realms.len());

    Ok(task)
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(index, "relam", &["name"], &[]).await
}
