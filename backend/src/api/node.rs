use crate::{
    api::{Id, model::{event::Event, series::Series, realm::Realm}, Context},
};


/// A node with a globally unique ID. Mostly useful for relay.
#[juniper::graphql_interface(Context = Context, for = [Event, Realm, Series])]
pub(crate) trait Node {
    fn id(&self) -> Id;
}
