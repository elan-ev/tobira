//! Blocks that make up the content of realm pages.

use juniper::{graphql_interface, GraphQLEnum, GraphQLObject};
use postgres_types::FromSql;
use crate::Id;


/// The `Block` interface: a UI element that belongs to a realm.
#[graphql_interface(for = [Text, VideoList])]
pub(crate) trait Block {
    // To avoid code duplication, all the shared data is stored in `SharedData` and
    // only a `shared` method is mandatory. All other method (in particular, all
    // that are visible to GraphQL) are defined in the trait already.
    #[graphql(skip)]
    fn shared(&self) -> &SharedData;

    fn id(&self) -> Id {
        self.shared().id
    }
    fn index(&self) -> i32 {
        self.shared().index
    }
    fn title(&self) -> Option<&str> {
        self.shared().title.as_deref()
    }
}

#[derive(Debug, Clone, Copy, FromSql)]
#[postgres(name = "block_type")]
pub(crate) enum BlockType {
    #[postgres(name = "text")]
    Text,
    #[postgres(name = "videolist")]
    VideoList,
}

#[derive(Debug, Clone, Copy, FromSql, GraphQLEnum)]
#[postgres(name = "video_list_layout")]
pub(crate) enum VideoListLayout {
    #[postgres(name = "horizontal")]
    Horizontal,
    #[postgres(name = "vertical")]
    Vertical,
    #[postgres(name = "grid")]
    Grid,
}

#[derive(Debug, Clone, Copy, FromSql, GraphQLEnum)]
#[postgres(name = "video_list_order")]
pub(crate) enum VideoListOrder {
    #[postgres(name = "new_to_old")]
    NewToOld,
    #[postgres(name = "old_to_new")]
    OldToNew,
}

/// Data shared by all blocks.
pub(crate) struct SharedData {
    pub(crate) id: Id,
    pub(crate) index: i32,
    pub(crate) title: Option<String>,
}

/// A block just showing some text.
#[derive(GraphQLObject)]
#[graphql(impl = BlockValue)]
pub(crate) struct Text {
    #[graphql(skip)]
    pub(crate) shared: SharedData,
    pub(crate) content: String,
}

#[graphql_interface]
impl Block for Text {
    fn shared(&self) -> &SharedData {
        &self.shared
    }
}

/// A block just showing some text.
#[derive(GraphQLObject)]
#[graphql(impl = BlockValue)]
pub(crate) struct VideoList {
    #[graphql(skip)]
    pub(crate) shared: SharedData,
    pub(crate) series: Id,
    pub(crate) layout: VideoListLayout,
    pub(crate) order: VideoListOrder,
}

#[graphql_interface]
impl Block for VideoList {
    fn shared(&self) -> &SharedData {
        &self.shared
    }
}
