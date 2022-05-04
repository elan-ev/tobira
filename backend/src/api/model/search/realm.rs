use crate::{
    api::{Context, Node, Id, NodeValue},
    search,
};


impl Node for search::Realm {
    fn id(&self) -> Id {
        Id::search_realm(self.id.0)
    }
}

#[juniper::graphql_object(Context = Context, impl = NodeValue, name = "SearchRealm")]
impl search::Realm {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn path(&self) -> &str {
        &self.full_path
    }

    fn ancestor_names(&self) -> &[String] {
        &self.ancestor_names
    }
}
