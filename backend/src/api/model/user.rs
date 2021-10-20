use crate::auth::{UserData, UserSession};


#[derive(juniper::GraphQLObject)]
pub(crate) struct User<'a> {
    /// The username, a unique string identifying the user.
    username: &'a str,

    /// The name of the user intended to be read by humans.
    display_name: &'a str,
}

impl<'a> User<'a> {
    pub(crate) fn from_session(session: &'a UserSession) -> Option<Self> {
        match session {
            UserSession::None => None,
            UserSession::Some(UserData { username, display_name, .. })
                => Some(Self { username, display_name }),
        }
    }
}
