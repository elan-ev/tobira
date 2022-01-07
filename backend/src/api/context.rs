use std::sync::Arc;

use crate::{
    api::err::{ApiError, ApiErrorKind, ApiResult},
    auth::{AuthToken, JwtContext, User},
    config::Config,
    db::Transaction,
};


/// The context that is accessible to every resolver in our API.
pub(crate) struct Context {
    pub(crate) db: Transaction,
    pub(crate) user: User,
    pub(crate) config: Arc<Config>,
    pub(crate) jwt: Arc<JwtContext>,
}

impl juniper::Context for Context {}

impl Context {
    /// Returns a connection to the DB. Requires an auth token to prove the
    /// endpoint somehow handled authorization.
    pub(crate) fn db(&self, _: AuthToken) -> &Transaction {
        &self.db
    }

    pub(crate) fn require_upload_permission(&self) -> ApiResult<AuthToken> {
        self.user.required_upload_permission(&self.config.auth).ok_or_else(|| {
            if let User::Some(user) = &self.user {
                ApiError {
                    msg: format!("User '{}' is not allowed to upload videos", user.username),
                    kind: ApiErrorKind::NotAuthorized,
                    key: Some("upload.not-authorized"),
                }
            } else {
                ApiError {
                    msg: "upload permission required, but user is not logged in".into(),
                    kind: ApiErrorKind::NotAuthorized,
                    key: Some("upload.not-logged-in"),
                }
            }
        })
    }

    pub(crate) fn require_moderator(&self) -> ApiResult<AuthToken> {
        self.user.require_moderator(&self.config.auth).ok_or_else(|| {
            if let User::Some(user) = &self.user {
                ApiError {
                    msg: format!("moderator required, but '{}' is not a moderator", user.username),
                    kind: ApiErrorKind::NotAuthorized,
                    key: Some("mutation.not-a-moderator"),
                }
            } else {
                ApiError {
                    msg: "moderator required, but user is not logged in".into(),
                    kind: ApiErrorKind::NotAuthorized,
                    key: Some("mutation.not-logged-in"),
                }
            }
        })
    }
}
