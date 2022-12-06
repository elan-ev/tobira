use juniper::GraphQLEnum;

use crate::{api::err::not_authorized, auth::AuthContext, prelude::HasRoles};

use super::{err::ApiResult, Context};


pub(crate) fn jwt(service: JwtService, context: &Context) -> ApiResult<String> {
    let AuthContext::User(user) = &context.auth else {
        return Err(not_authorized!("only logged in users can get a JWT"));
    };

    let (is_allowed, action) = match service {
        JwtService::Upload => (user.can_upload(&context.config.auth), "upload"),
        JwtService::Studio => (user.can_use_studio(&context.config.auth), "use Studio"),
        JwtService::Editor => (user.can_use_editor(&context.config.auth), "use the editor"),
    };

    if !is_allowed {
        return Err(not_authorized!("User {} does not have permission to {}", user.username, action));
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
