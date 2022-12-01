use juniper::GraphQLEnum;

use crate::{auth::AuthContext, prelude::HasRoles};

use super::{err::{ApiResult, ApiError, ApiErrorKind}, Context};


pub(crate) fn jwt(service: JwtService, context: &Context) -> ApiResult<String> {
    let AuthContext::User(user) = &context.auth else {
        return Err(ApiError {
            msg: "only logged in users can get a JWT".into(),
            kind: ApiErrorKind::NotAuthorized,
            key: None,
        });
    };

    let is_not_allowed = match service {
        JwtService::Upload => (!user.can_upload(&context.config.auth))
            .then_some("upload"),
        JwtService::Studio => (!user.can_use_studio(&context.config.auth))
            .then_some("use Studio"),
        JwtService::Editor => (!user.can_use_editor(&context.config.auth))
            .then_some("use the editor"),
    };

    if let Some(action) = is_not_allowed {
        return Err(ApiError {
            msg: format!("User {} does not have permission to {}", user.username, action),
            kind: ApiErrorKind::NotAuthorized,
            key: None,
        });
    }

    Ok(context.jwt.new_token(&user))
}

/// Services a user can be pre-authenticated for using a JWT
#[derive(GraphQLEnum)]
pub(crate) enum JwtService {
    Upload,
    Studio,
    Editor,
}
