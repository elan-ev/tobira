use crate::{
    api::{Context, err::ApiResult, util::TranslatedString},
    prelude::*,
    db::util::impl_from_db,
};



/// A group selectable in the ACL UI. Basically a mapping from role to a nice
/// label and info about the relationship to other roles/groups.
#[derive(juniper::GraphQLObject)]
pub struct KnownGroup {
    role: String,
    label: TranslatedString,
    implies: Vec<String>,
    large: bool,
}

impl_from_db!(
    KnownGroup,
    select: {
        known_groups.{ role, label, implies, large },
    },
    |row| {
        KnownGroup {
            role: row.role(),
            label: row.label(),
            implies: row.implies(),
            large: row.large(),
        }
    },
);

impl KnownGroup {
    pub(crate) async fn load_all(context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from known_groups");
        context.db.query_mapped(&query, dbargs![], |row| Self::from_row_start(&row))
            .await?
            .pipe(Ok)
    }
}
