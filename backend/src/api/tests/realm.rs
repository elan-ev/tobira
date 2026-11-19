use serde_json::json;

use crate::{model::Key, prelude::*};
use super::util::TestApi;


#[tokio::test]
async fn realm_by_path() -> Result<()> {
    let api = TestApi::new().await?;
    api.db.add_realm("Animals", Key(0), "animals").await?;

    api.query(r#"{ realmByPath(path: "/animals") { name path } }"#)
        .run().await?
        .assert_ok(json!({
            "realmByPath": { "name": "Animals", "path": "/animals" },
        }));

    Ok(())
}
