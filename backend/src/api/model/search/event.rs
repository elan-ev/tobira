use chrono::{DateTime, Utc};

use crate::{
    api::{Context, Node, Id, NodeValue},
    search,
};


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

    fn series_id(&self) -> Option<Id> {
        if let Some(id) = self.series_id {
            Some(Id::search_series(id.0))
        } else {
            None
        }
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

    fn duration(&self) -> f64 {
        self.duration as f64
    }

    fn is_live(&self) -> bool {
        self.is_live
    }

    fn audio_only(&self) -> bool {
        self.audio_only
    }

    fn created(&self) -> DateTime<Utc> {
        self.created
    }

    fn start_time(&self) -> Option<DateTime<Utc>> {
        self.start_time
    }

    fn end_time(&self) -> Option<DateTime<Utc>> {
        self.end_time
    }

    fn host_realms(&self) -> &[search::Realm] {
        &self.host_realms
    }
}
