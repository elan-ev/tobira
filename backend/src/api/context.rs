use std::sync::Arc;

use crate::{
    api::err::{ApiError, ApiErrorKind, ApiResult},
    auth::{AuthToken, UserSession},
    config::Config,
    db::Transaction,
};


/// The context that is accessible to every resolver in our API.
pub(crate) struct Context {
    pub(crate) db: Transaction,
    pub(crate) user: UserSession,
    pub(crate) config: Arc<Config>,
}

impl juniper::Context for Context {}

impl Context {
    /// Returns a connection to the DB. Requires an auth token to prove the
    /// endpoint somehow handled authorization.
    pub(crate) fn db(&self, _: AuthToken) -> &Transaction {
        &self.db
    }

    pub(crate) fn require_moderator(&self) -> ApiResult<AuthToken> {
        self.user.require_moderator(&self.config.auth).ok_or_else(|| {
            if let UserSession::User { username, .. } = &self.user {
                ApiError {
                    msg: format!("moderator required, but '{}' is not a moderator", username),
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
