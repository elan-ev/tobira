use std::sync::Arc;

use crate::{
    api::err::{ApiError, ApiErrorKind, ApiResult},
    auth::{AuthToken, JwtContext, AuthContext},
    config::Config,
    db::Transaction,
    search,
    prelude::*,
};


/// The context that is accessible to every resolver in our API.
pub(crate) struct Context {
    pub(crate) db: Transaction,
    pub(crate) auth: AuthContext,
    pub(crate) config: Arc<Config>,
    pub(crate) jwt: Arc<JwtContext>,
    pub(crate) search: Arc<search::Client>,
}

impl juniper::Context for Context {}

impl Context {
    /// Returns a connection to the DB. Requires an auth token to prove the
    /// endpoint somehow handled authorization.
    pub(crate) fn db(&self, _: AuthToken) -> &Transaction {
        &self.db
    }

    pub(crate) fn require_moderator(&self) -> ApiResult<AuthToken> {
        self.auth.require_moderator(&self.config.auth).ok_or_else(|| {
            if let AuthContext::User(user) = &self.auth {
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
