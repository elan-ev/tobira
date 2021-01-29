use juniper::graphql_object;

use crate::{id::Key, Id};


pub(crate) struct Series {
    key: Key,
    title: String,
    description: Option<String>,
}

#[graphql_object]
impl Series {
    fn id(&self) -> Id {
        Id::series(self.key)
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    // TODO Return events
}
