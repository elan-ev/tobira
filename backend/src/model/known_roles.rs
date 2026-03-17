use serde::Deserialize;

use crate::{api::Context, db::util::{impl_from_db}, prelude::*};

use super::{TranslatedString};


// ===== Groups ===============================================================

/// A group selectable in the ACL UI. Basically a mapping from role to a nice
/// label and info about the relationship to other roles/groups.
#[derive(juniper::GraphQLObject)]
pub struct KnownGroup {
    pub role: String,
    pub label: TranslatedString,
    pub implies: Vec<String>,
    pub sort_key: Option<String>,
    pub large: bool,
}

impl_from_db!(
    KnownGroup,
    select: {
        known_groups.{ role, label, implies, sort_key, large },
    },
    |row| {
        KnownGroup {
            role: row.role(),
            label: row.label(),
            implies: row.implies(),
            sort_key: row.sort_key(),
            large: row.large(),
        }
    },
);

impl KnownGroup {
    pub(crate) async fn load_all(context: &Context) -> Result<Vec<Self>, tokio_postgres::Error> {
        let selection = Self::select();
        let query = format!("select {selection} from known_groups");
        context.db.query_mapped(&query, dbargs![], |row| Self::from_row_start(&row)).await
    }
}



// ===== Users ===============================================================

#[derive(juniper::GraphQLObject, Deserialize)]
pub(crate) struct KnownUser {
    pub display_name: String,
    pub user_role: String,
}
