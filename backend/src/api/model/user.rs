use crate::auth::{AuthConfig, User, UserData};


#[derive(juniper::GraphQLObject)]
pub(crate) struct UserApi<'a> {
    /// The username, a unique string identifying the user.
    username: &'a str,

    /// The name of the user intended to be read by humans.
    display_name: &'a str,

    /// `True` if the user has the permission to upload videos.
    can_upload: bool,
}

impl<'a> UserApi<'a> {
    pub(crate) fn from(session: &'a User, auth_config: &AuthConfig) -> Option<Self> {
        match session {
            User::None => None,
            User::Some(UserData { username, display_name, .. }) => {
                Some(Self {
                    username,
                    display_name,
                    can_upload: session.can_upload(auth_config),
                })
            }
        }
    }
}
