use serde_json::json;

use crate::{model::Key, prelude::*};
use super::util::{TestApi, GUSTAV_PAGE_ADMIN, JOSE_STUDENT, ROOT_REALM_ID};


const ADD_REALM: &str = "mutation ($parent: ID!, $name: String!, $path: String!) {
    addRealm(realm: { parent: $parent, name: $name, pathSegment: $path }) {
        name path
    }
}";


#[tokio::test]
async fn root_realm() -> Result<()> {
    let api = TestApi::new().await?;

    api.query("{ rootRealm { id path } }")
        .run().await?
        .assert_ok(json!({
            "rootRealm": { "id": ROOT_REALM_ID, "path": "/" },
        }));

    Ok(())
}

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

#[tokio::test]
async fn add_realm() -> Result<()> {
    let api = TestApi::new().await?;
    let vars = json!({ "parent": ROOT_REALM_ID, "name": "Animals", "path": "animals" });

    api.query(ADD_REALM).vars(&vars).as_user(&GUSTAV_PAGE_ADMIN)
        .run().await?
        .assert_ok(json!({
            "addRealm": { "name": "Animals", "path": "/animals" },
        }));

    // The mutation was committed, so the realm is visible in later requests.
    api.query(r#"{ realmByPath(path: "/animals") { name } }"#)
        .run().await?
        .assert_ok(json!({
            "realmByPath": { "name": "Animals" },
        }));

    Ok(())
}

#[tokio::test]
async fn add_realm_not_allowed() -> Result<()> {
    let api = TestApi::new().await?;
    let vars = json!({ "parent": ROOT_REALM_ID, "name": "Animals", "path": "animals" });

    api.query(ADD_REALM).vars(&vars)
        .run().await?
        .assert_error(json!({ "kind": "NOT_AUTHORIZED", "key": "mutation.not-logged-in" }));

    api.query(ADD_REALM).vars(&vars).as_user(&JOSE_STUDENT)
        .run().await?
        .assert_error(json!({ "kind": "NOT_AUTHORIZED", "key": "realm.no-moderator-rights" }));

    api.query(r#"{ realmByPath(path: "/animals") { name } }"#)
        .run().await?
        .assert_ok(json!({ "realmByPath": null }));

    Ok(())
}

#[tokio::test]
async fn add_realm_path_collision() -> Result<()> {
    let api = TestApi::new().await?;
    let vars = json!({ "parent": ROOT_REALM_ID, "name": "Animals", "path": "animals" });

    api.query(ADD_REALM).vars(&vars).as_user(&GUSTAV_PAGE_ADMIN)
        .run().await?
        .assert_no_errors();

    api.query(ADD_REALM).vars(&vars).as_user(&GUSTAV_PAGE_ADMIN)
        .run().await?
        .assert_error(json!({ "kind": "INVALID_INPUT", "key": "realm.path-collision" }));

    Ok(())
}
