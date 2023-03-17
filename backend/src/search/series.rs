use meilisearch_sdk::indexes::Index;
use serde::{Serialize, Deserialize};
use tokio_postgres::GenericClient;

use crate::{
    prelude::*,
    db::{types::Key, util::{collect_rows_mapped, impl_from_db}},
};

use super::{realm::Realm, SearchId, IndexItem, IndexItemKind, util};



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Series {
    pub(crate) id: SearchId,
    pub(crate) opencast_id: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,

    // See `search::Event::*_roles` for notes that also apply here.
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,

    // The `listed` field is always `!host_realms.is_empty()`, but we need to
    // store it explicitly to filter for this condition in Meili.
    pub(crate) listed: bool,
    pub(crate) host_realms: Vec<Realm>,
}

impl IndexItem for Series {
    const KIND: IndexItemKind = IndexItemKind::Series;
    fn id(&self) -> SearchId {
        self.id
    }
}

impl_from_db!(
    Series,
    select: {
        search_series.{
            id, opencast_id, title, description, read_roles, write_roles,
            listed_via_events, host_realms,
        },
    },
    |row| {
        let host_realms = row.host_realms::<Vec<Realm>>();
        let listed = host_realms.iter().any(|realm| !realm.is_user_realm())
            || row.listed_via_events();
        Self {
            id: row.id(),
            opencast_id: row.opencast_id(),
            title: row.title(),
            description: row.description(),
            read_roles: util::encode_acl(&row.read_roles::<Vec<String>>()),
            write_roles: util::encode_acl(&row.write_roles::<Vec<String>>()),
            listed,
            host_realms,
        }
    }
);

impl Series {
    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_series \
            where id = any($1) and state <> 'waiting'");
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load series from DB")
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_series where state <> 'waiting'");
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load series from DB")
    }
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(
        index,
        "series",
        &["title", "description"],
        &["listed", "read_roles", "write_roles"],
    ).await
}
