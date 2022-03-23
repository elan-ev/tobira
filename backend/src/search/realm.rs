use meilisearch_sdk::{document::Document, tasks::Task, indexes::Index};
use serde::{Serialize, Deserialize};

use crate::{prelude::*, db::DbConnection};

use super::{Client, SearchId, lazy_set_special_attributes};


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

/// Load all realms from the DB and store them in the index.
pub(super) async fn rebuild(meili: &Client, db: &DbConnection) -> Result<Task> {
    // This nifty query gets all ancestors as array for each realm. We don't
    // include the root realm nor the realm itself in that array though.
    let query = "select id, name, full_path, \
        ARRAY(select name from ancestors_of_realm(id) where height <> 0 offset 1) \
        from realms";
    let realms = db.query_raw(query, dbargs![])
        .await?
        .map_ok(|row| {
            Realm {
                id: SearchId(row.get(0)),
                name: row.get(1),
                full_path: row.get(2),
                ancestor_names: row.get(3),
            }
        })
        .try_collect::<Vec<_>>()
        .await?;
    debug!("Loaded {} realms from DB", realms.len());

    let task = meili.realm_index.add_documents(&realms, None).await?;
    debug!("Sent {} realms to Meili for indexing", realms.len());

    Ok(task)
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    lazy_set_special_attributes(index, "relam", &["name"], &[]).await
}
