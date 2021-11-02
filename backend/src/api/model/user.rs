use crate::auth::{UserData, User};


#[derive(juniper::GraphQLObject)]
pub(crate) struct UserApi<'a> {
    /// The username, a unique string identifying the user.
    username: &'a str,

    /// The name of the user intended to be read by humans.
    display_name: &'a str,
}

impl<'a> UserApi<'a> {
    pub(crate) fn from(session: &'a User) -> Option<Self> {
        match session {
            User::None => None,
            User::Some(UserData { username, display_name, .. })
                => Some(Self { username, display_name }),
        }
    }
}
