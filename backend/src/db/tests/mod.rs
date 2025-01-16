use crate::{prelude::*, model::Key};
use super::DbConfig;
use self::util::TestDb;

mod util;
mod search_queue;


#[tokio::test(flavor = "multi_thread")]
async fn root_realm_exists() -> Result<()> {
    let db = TestDb::with_migrations().await?;
    let row = db.query_one("select * from realms", &[]).await?;
    assert_eq!(row.get::<_, Key>("id"), Key(0));
    assert_eq!(row.get::<_, String>("path_segment"), "");
    assert_eq!(row.get::<_, String>("full_path"), "");

    Ok(())
}
