use crate::{
    api::{Context, Node, Id, NodeValue},
    db::types::Key,
};



pub(crate) struct SearchRealm {
    pub(crate) key: Key,
    pub(crate) name: String,
    pub(crate) full_path: String,
}

#[juniper::graphql_interface]
impl Node for SearchRealm {
    fn id(&self) -> Id {
        Id::search_realm(self.key)
    }
}

#[juniper::graphql_object(Context = Context, impl = NodeValue)]
impl SearchRealm {
    fn name(&self) -> &str {
        &self.name
    }
    fn full_path(&self) -> &str {
        &self.full_path
    }
}
