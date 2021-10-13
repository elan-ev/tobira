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
}
