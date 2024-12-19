use chrono::{DateTime, Utc};
use meilisearch_sdk::indexes::Index;
use serde::{Serialize, Deserialize};
use tokio_postgres::GenericClient;

use crate::{
    prelude::*,
    db::{types::Key, util::{collect_rows_mapped, impl_from_db}},
};

use super::{realm::Realm, util::{self, FieldAbilities}, IndexItem, IndexItemKind, SearchId};



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Playlist {
    pub(crate) id: SearchId,
    pub(crate) opencast_id: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) creator: Option<String>,
    pub(crate) updated: DateTime<Utc>,
    pub(crate) updated_timestamp: i64,

    // See `search::Event::*_roles` for notes that also apply here.
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,

    // The `listed` field is always derived from `host_realms`, but we need to
    // store it explicitly to filter for this condition in Meili.
    pub(crate) listed: bool,
    pub(crate) host_realms: Vec<Realm>,
}

impl IndexItem for Playlist {
    const KIND: IndexItemKind = IndexItemKind::Playlist;
    fn id(&self) -> SearchId {
        self.id
    }
}

impl_from_db!(
    Playlist,
    select: {
        search_playlists.{
            id, opencast_id,
            title, description, creator,
            read_roles, write_roles,
            host_realms, updated,
        },
    },
    |row| {
        let host_realms = row.host_realms::<Vec<Realm>>();
        let updated = row.updated();
        Self {
            id: row.id(),
            opencast_id: row.opencast_id(),
            title: row.title(),
            description: row.description(),
            creator: row.creator(),
            updated,
            updated_timestamp: updated.timestamp(),
            read_roles: util::encode_acl(&row.read_roles::<Vec<String>>()),
            write_roles: util::encode_acl(&row.write_roles::<Vec<String>>()),
            listed: host_realms.iter().any(|realm| !realm.is_user_realm()),
            host_realms,
        }
    }
);

impl Playlist {
    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_playlists \
            where id = any($1)");
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load playlists from DB")
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_playlists");
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load playlists from DB")
    }
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(index, "playlist", true, FieldAbilities {
        searchable: &["title", "description"],
        filterable: &["read_roles", "write_roles"],
        sortable: &["updated_timestamp"],
    }).await
}
