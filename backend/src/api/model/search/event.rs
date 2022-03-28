use crate::{
    api::{Context, Node, Id, NodeValue},
    search,
};


#[juniper::graphql_interface]
impl Node for search::Event {
    fn id(&self) -> Id {
        Id::search_event(self.id.0)
    }
}

#[juniper::graphql_object(Context = Context, impl = NodeValue, name = "SearchEvent")]
impl search::Event {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn series_title(&self) -> Option<&str> {
        self.series_title.as_deref()
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    fn creators(&self) -> &[String] {
        &self.creators
    }

    fn thumbnail(&self) -> Option<&str> {
        self.thumbnail.as_deref()
    }

    fn duration(&self) -> i32 {
        self.duration
    }
}
