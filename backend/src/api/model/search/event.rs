use crate::{
    api::{Context, Node, Id, NodeValue, model::event::Track},
    db::types::Key,
};



pub(crate) struct SearchEvent {
    pub(crate) key: Key,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) thumbnail: Option<String>,
    pub(crate) duration: i32,
    pub(crate) tracks: Vec<Track>,
}

#[juniper::graphql_interface]
impl Node for SearchEvent {
    fn id(&self) -> Id {
        Id::search_event(self.key)
    }
}

#[juniper::graphql_object(Context = Context, impl = NodeValue)]
impl SearchEvent {
    fn title(&self) -> &str {
        &self.title
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    fn thumbnail(&self) -> Option<&str> {
        self.thumbnail.as_deref()
    }

    fn duration(&self) -> i32 {
        self.duration
    }

    fn tracks(&self) -> &[Track] {
        &self.tracks
    }
}
