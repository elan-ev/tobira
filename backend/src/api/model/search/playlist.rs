use crate::{
    api::{Context, Node, Id, NodeValue},
    search,
};


impl Node for search::Playlist {
    fn id(&self) -> Id {
        Id::search_playlist(self.id.0)
    }
}

#[juniper::graphql_object(Context = Context, impl = NodeValue, name = "SearchPlaylist")]
impl search::Playlist {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    fn host_realms(&self) -> &[search::Realm] {
        &self.host_realms
    }
}
