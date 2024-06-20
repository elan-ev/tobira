use std::sync::Arc;

use crate::{
    api::err::{ApiError, ApiErrorKind, ApiResult},
    auth::{AuthToken, JwtContext, AuthContext},
    config::Config,
    db::Transaction,
    search,
    sync::OcClient,
    prelude::*,
};


/// The context that is accessible to every resolver in our API.
pub(crate) struct Context {
    pub(crate) db: Transaction,
    pub(crate) auth: AuthContext,
    pub(crate) config: Arc<Config>,
    pub(crate) jwt: Arc<JwtContext>,
    pub(crate) search: Arc<search::Client>,
    pub(crate) oc_client: Arc<OcClient>,
}

impl juniper::Context for Context {}

impl Context {
    /// Returns a connection to the DB. Requires an auth token to prove the
    /// endpoint somehow handled authorization.
    pub(crate) fn db(&self, _: AuthToken) -> &Transaction {
        &self.db
    }

    pub(crate) fn require_tobira_admin(&self) -> ApiResult<AuthToken> {
        self.auth.require_tobira_admin(&self.config.auth).ok_or_else(|| {
            self.access_error(
                "mutation.not-a-tobira-admin",
                |user| format!("Tobira admin required, but '{user}' is not"),
            )
        })
    }

    pub(crate) fn access_error(
        &self,
        translation_key: &'static str,
        msg: impl FnOnce(&str) -> String,
    ) -> ApiError {
        if let AuthContext::User(user) = &self.auth {
            ApiError {
                msg: msg(&user.username),
                kind: ApiErrorKind::NotAuthorized,
                key: Some(translation_key),
            }
        } else {
            self.not_logged_in_error()
        }
    }

    pub(crate) fn not_logged_in_error(&self) -> ApiError {
        ApiError {
            msg: "user is not logged in".into(),
            kind: ApiErrorKind::NotAuthorized,
            key: Some("mutation.not-logged-in"),
        }
    }
}
