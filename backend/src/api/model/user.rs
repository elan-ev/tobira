use crate::{
    api::Context,
    auth::User,
};


#[juniper::graphql_object(Context = Context)]
impl User {
    /// Returns the username, a unique string identifying the user.
    fn username(&self) -> &str {
        &self.username
    }

    /// Returns the name of the user intended to be read by humans.
    fn display_name(&self) -> &str {
        &self.display_name
    }

    /// Returns all roles of this user.
    fn roles(&self) -> &[String] {
        &self.roles
    }

    /// Returns whether this user is a moderator.
    fn is_moderator(&self, context: &Context) -> bool {
        self.is_moderator(&context.config.auth)
    }

    /// Returns whether this user is an admin.
    fn is_admin(&self) -> bool {
        self.is_admin()
    }
}
