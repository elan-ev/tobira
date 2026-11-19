use serde_json::json;

use crate::prelude::*;
use super::util::{TestApi, ADMIN, JOSE_STUDENT, SABINE_INSTRUCTOR};


#[tokio::test]
async fn event_read_access() -> Result<()> {
    let api = TestApi::new().await?;
    let event = api.db.add_event("Secret", 60, "secret-event", None).await?;
    api.db.execute("update events set read_roles = '{ROLE_STAFF}' where id = $1", &[&event]).await?;

    let query = r#"query ($id: String!) {
        currentUser { username }
        eventByOpencastId(id: $id) {
            __typename
            ... on AuthorizedEvent { title }
        }
    }"#;
    let vars = json!({ "id": "secret-event" });

    api.query(query).vars(&vars)
        .run().await?
        .assert_ok(json!({
            "currentUser": null,
            "eventByOpencastId": { "__typename": "NotAllowed" },
        }));

    api.query(query).vars(&vars).as_user(&JOSE_STUDENT)
        .run().await?
        .assert_ok(json!({
            "currentUser": { "username": "jose" },
            "eventByOpencastId": { "__typename": "NotAllowed" },
        }));

    api.query(query).vars(&vars).as_user(&SABINE_INSTRUCTOR)
        .run().await?
        .assert_ok(json!({
            "currentUser": { "username": "sabine" },
            "eventByOpencastId": { "__typename": "AuthorizedEvent", "title": "Secret" },
        }));

    api.query(query).vars(&vars).as_user(&ADMIN)
        .run().await?
        .assert_ok(json!({
            "currentUser": { "username": "admin" },
            "eventByOpencastId": { "__typename": "AuthorizedEvent", "title": "Secret" },
        }));

    Ok(())
}
