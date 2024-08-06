use crate::{
    api::{Context, Id, Node, NodeValue},
    search, HasRoles,
};

use super::ThumbnailInfo;


impl Node for search::Series {
    fn id(&self) -> Id {
        Id::search_series(self.id.0)
    }
}

#[juniper::graphql_object(Context = Context, impl = NodeValue, name = "SearchSeries")]
impl search::Series {
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

    fn thumbnails(&self, context: &Context) -> Vec<ThumbnailInfo> {
        self.thumbnails.iter()
            .filter(|info| context.auth.overlaps_roles(&info.read_roles))
            .map(|info| ThumbnailInfo {
                thumbnail: info.url.clone(),
                audio_only: info.audio_only,
                is_live: info.live,
            })
            .take(3)
            .collect()
    }
}
