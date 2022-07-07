use meilisearch_sdk::{document::Document, indexes::Index};
use postgres_types::FromSql;
use serde::{Serialize, Deserialize};
use tokio_postgres::GenericClient;

use crate::{prelude::*, db::{types::Key, util::{collect_rows_mapped, impl_from_db}}};

use super::{SearchId, IndexItem, IndexItemKind, util};


/// Representation of realms in the search index.
#[derive(Serialize, Deserialize, Debug, FromSql)]
#[postgres(name = "search_realms")]
pub(crate) struct Realm {
    pub(crate) id: SearchId,
    pub(crate) name: String,
    pub(crate) full_path: String,

    /// Includes the names of all ancestors, excluding the root and this realm
    /// itself. It starts with a direct child of the root and ends with the
    /// parent of `self`.
    pub(crate) ancestor_names: Vec<Option<String>>,
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

impl_from_db!(
    Realm,
    select: {
        search_realms.{ id, name, full_path, ancestor_names },
    },
    |row| {
        Self {
            id: row.id(),
            name: row.name(),
            full_path: row.full_path(),
            ancestor_names: row.ancestor_names(),
        }
    }
);

impl Realm {
    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_realms where id = any($1)");
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row)).await.map_err(Into::into)
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_realms");
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row)).await.map_err(Into::into)
    }
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(index, "realm", &["name"], &[]).await
}
