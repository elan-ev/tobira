
use crate::{
    http::Context, prelude::*, sync::client::AuthMode
};
use super::User;


/// Requests `/info/me.json` and converts the information into a `User`.
pub(super) async fn user_from_info_me(
    mode: AuthMode<'_>,
    ctx: &Context,
) -> Result<Option<User>> {
    let info = ctx.oc_client.info_me(mode).await?;
    let Some(mut info) = info else { return Ok(None); };

    // Make sure the roles list always contains the user role. This is very
    // likely always the case, but better be sure.
    if !info.roles.contains(&info.user_role) {
        info.roles.push(info.user_role.clone());
    }

    // Otherwise the login was correct!
    Ok(Some(User {
        username: info.user.username,
        display_name: info.user.name,
        email: info.user.email,
        roles: info.roles.into_iter().collect(),
        user_role: info.user_role,
        user_realm_handle: None,
    }))
}
