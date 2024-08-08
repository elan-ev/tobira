use meilisearch_sdk::indexes::Index;
use serde::{Serialize, Deserialize};
use tokio_postgres::GenericClient;

use crate::{
    prelude::*,
    db::{types::Key, util::{collect_rows_mapped, impl_from_db}},
};

use super::{util::{self, FieldAbilities}, IndexItem, IndexItemKind, SearchId};



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct User {
    pub(crate) id: SearchId,
    pub(crate) username: String,
    pub(crate) user_role: String,
    pub(crate) display_name: String,
    pub(crate) email: Option<String>,
}

impl IndexItem for User {
    const KIND: IndexItemKind = IndexItemKind::User;
    fn id(&self) -> SearchId {
        self.id
    }
}

impl_from_db!(
    User,
    select: {
        users.{id, username, user_role, display_name, email},
    },
    |row| {
        Self {
            id: row.id(),
            username: row.username(),
            user_role: row.user_role(),
            display_name: row.display_name(),
            email: row.email(),
        }
    }
);

impl User {
    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from users where id = any($1)");
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load users from DB")
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from users");
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load users from DB")
    }
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(index, "user", FieldAbilities {
        searchable: &["display_name"],
        filterable: &[],
        sortable: &[],
    }).await
}
