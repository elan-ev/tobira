use std::sync::Arc;

use crate::{
    api::err::{ApiError, ApiErrorKind, not_authorized},
    auth::{AuthContext, AuthState, JwtContext},
    config::Config,
    db::Transaction,
    search,
    sync::OcClient,
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
    pub(crate) fn access_error(
        &self,
        translation_key: &'static str,
        msg: impl FnOnce(&str) -> String,
    ) -> ApiError {
        if let AuthState::User(user) = &self.auth.state {
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

    pub fn require_trusted_external_auth(&self) -> Result<(), ApiError> {
        if self.auth.state != AuthState::TrustedExternal {
            return Err(not_authorized!("only trusted external applications can use this mutation"));
        }
        Ok(())
    }
}
