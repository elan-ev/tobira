use serde_json::json;

use crate::prelude::*;
use super::util::{TestApi, ADMIN, GUSTAV_PAGE_ADMIN, JOSE_STUDENT, SABINE_INSTRUCTOR};


#[tokio::test]
async fn current_user_permissions() -> Result<()> {
    let api = TestApi::new().await?;
    let query = "{
        currentUser {
            username
            displayName
            userRole
            canUpload
            canUseStudio
            canUseEditor
            canCreateUserRealm
            canFindUnlisted
            canCreateSeries
            canCreatePlaylists
            isTobiraAdmin
            isAdmin
        }
    }";

    api.query(query)
        .run().await?
        .assert_ok(json!({ "currentUser": null }));

    api.query(query).as_user(&JOSE_STUDENT)
        .run().await?
        .assert_ok(json!({
            "currentUser": {
                "username": "jose",
                "displayName": "José Carreño Quiñones",
                "userRole": "ROLE_USER_JOSE",
                "canUpload": false,
                "canUseStudio": false,
                "canUseEditor": true,
                "canCreateUserRealm": true,
                "canFindUnlisted": false,
                "canCreateSeries": false,
                "canCreatePlaylists": true,
                "isTobiraAdmin": false,
                "isAdmin": false,
            },
        }));

    api.query(query).as_user(&SABINE_INSTRUCTOR)
        .run().await?
        .assert_ok(json!({
            "currentUser": {
                "username": "sabine",
                "displayName": "Sabine Rudolfs",
                "userRole": "ROLE_USER_SABINE",
                "canUpload": true,
                "canUseStudio": true,
                "canUseEditor": true,
                "canCreateUserRealm": true,
                "canFindUnlisted": true,
                "canCreateSeries": true,
                "canCreatePlaylists": true,
                "isTobiraAdmin": false,
                "isAdmin": false,
            },
        }));

    // Being global page admin does not grant any of these permissions.
    api.query(query).as_user(&GUSTAV_PAGE_ADMIN)
        .run().await?
        .assert_ok(json!({
            "currentUser": {
                "username": "gustav",
                "displayName": "Gustav Mahler",
                "userRole": "ROLE_USER_GUSTAV",
                "canUpload": false,
                "canUseStudio": false,
                "canUseEditor": true,
                "canCreateUserRealm": true,
                "canFindUnlisted": false,
                "canCreateSeries": false,
                "canCreatePlaylists": true,
                "isTobiraAdmin": false,
                "isAdmin": false,
            },
        }));

    api.query(query).as_user(&ADMIN)
        .run().await?
        .assert_ok(json!({
            "currentUser": {
                "username": "admin",
                "displayName": "Administrator",
                "userRole": "ROLE_USER_ADMIN",
                "canUpload": true,
                "canUseStudio": true,
                "canUseEditor": true,
                "canCreateUserRealm": true,
                "canFindUnlisted": true,
                "canCreateSeries": true,
                "canCreatePlaylists": true,
                "isTobiraAdmin": true,
                "isAdmin": true,
            },
        }));

    Ok(())
}
