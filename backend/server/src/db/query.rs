use anyhow::Result;
use futures::stream::TryStreamExt;

use super::Db;


/// Returns meta information about all tables in the `public` schema.
pub(super) async fn all_table_names(db: &Db) -> Result<Vec<String>> {
    let rows = db.query_raw(
            "select table_name from information_schema.tables where table_schema='public'",
            std::iter::empty(),
        )
        .await?
        .map_ok(|row| row.get::<_, String>("table_name"));

    Ok(rows.try_collect().await?)
}
