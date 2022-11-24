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

    fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    fn path(&self) -> &str {
        if self.full_path.is_empty() { "/" } else { &self.full_path }
    }

    fn ancestor_names(&self) -> &[Option<String>] {
        &self.ancestor_names
    }
}
