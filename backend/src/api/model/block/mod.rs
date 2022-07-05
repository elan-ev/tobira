//! Blocks that make up the content of realm pages.

use juniper::{graphql_interface, graphql_object, GraphQLEnum};
use postgres_types::{FromSql, ToSql};

use crate::{
    api::{
        Context, Id,
        err::{ApiError, ApiResult},
        model::{event::{AuthorizedEvent, Event}, series::SeriesValue},
    },
    db::{types::Key, util::impl_from_db},
    prelude::*,
};


mod mutations;

pub(crate) use mutations::{
    NewTitleBlock,
    NewTextBlock,
    NewSeriesBlock,
    NewVideoBlock,
    UpdateTitleBlock,
    UpdateTextBlock,
    UpdateSeriesBlock,
    UpdateVideoBlock,
    RemovedBlock,
};


/// A `Block`: a UI element that belongs to a realm.
#[graphql_interface(Context = Context, for = [TitleBlock, TextBlock, SeriesBlock, VideoBlock])]
pub(crate) trait Block {
    // To avoid code duplication, all the shared data is stored in `SharedData`
    // and only a `shared` method is mandatory. All other method (in particular,
    // all that are visible to GraphQL) are defined in the trait already.
    #[graphql(skip)]
    fn shared(&self) -> &SharedData;

    fn id(&self) -> Id {
        self.shared().id
    }
    fn index(&self) -> i32 {
        self.shared().index
    }
}

#[derive(Debug, Clone, Copy, FromSql)]
#[postgres(name = "block_type")]
pub(crate) enum BlockType {
    #[postgres(name = "title")]
    Title,
    #[postgres(name = "text")]
    Text,
    #[postgres(name = "series")]
    Series,
    #[postgres(name = "video")]
    Video,
}

#[derive(Debug, Clone, Copy, FromSql, ToSql, GraphQLEnum)]
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
}

pub(crate) struct TitleBlock {
    pub(crate) shared: SharedData,
    pub(crate) content: String,
}

impl Block for TitleBlock {
    fn shared(&self) -> &SharedData {
        &self.shared
    }
}

/// A block just showing some title.
#[graphql_object(Context = Context, impl = BlockValue)]
impl TitleBlock {
    fn content(&self) -> &str {
        &self.content
    }

    fn id(&self) -> Id {
        self.shared().id
    }

    fn index(&self) -> i32 {
        self.shared().index
    }
}

pub(crate) struct TextBlock {
    pub(crate) shared: SharedData,
    pub(crate) content: String,
}

impl Block for TextBlock {
    fn shared(&self) -> &SharedData {
        &self.shared
    }
}

/// A block just showing some text.
#[graphql_object(Context = Context, impl = BlockValue)]
impl TextBlock {
    fn content(&self) -> &str {
        &self.content
    }

    fn id(&self) -> Id {
        self.shared().id
    }

    fn index(&self) -> i32 {
        self.shared().index
    }
}

pub(crate) struct SeriesBlock {
    pub(crate) shared: SharedData,
    pub(crate) series: Option<Id>,
    pub(crate) show_title: bool,
    pub(crate) order: VideoListOrder,
}

impl Block for SeriesBlock {
    fn shared(&self) -> &SharedData {
        &self.shared
    }
}

/// A block just showing the list of videos in an Opencast series
#[graphql_object(Context = Context, impl = BlockValue)]
impl SeriesBlock {
    async fn series(&self, context: &Context) -> ApiResult<Option<SeriesValue>> {
        match self.series {
            None => Ok(None),
            // `unwrap` is okay here because of our foreign key constraint
            Some(series_id) => Ok(Some(SeriesValue::load_by_id(series_id, context).await?.unwrap())),
        }
    }

    fn show_title(&self) -> bool {
        self.show_title
    }

    fn order(&self) -> VideoListOrder {
        self.order
    }

    fn id(&self) -> Id {
        self.shared().id
    }

    fn index(&self) -> i32 {
        self.shared().index
    }
}

pub(crate) struct VideoBlock {
    pub(crate) shared: SharedData,
    // Is `None` if the video was removed from the DB.
    pub(crate) event: Option<Id>,
    pub(crate) show_title: bool,
}

impl Block for VideoBlock {
    fn shared(&self) -> &SharedData {
        &self.shared
    }
}

/// A block for presenting a single Opencast event
#[graphql_object(Context = Context, impl = BlockValue)]
impl VideoBlock {
    async fn event(&self, context: &Context) -> ApiResult<Option<Event>> {
        match self.event {
            None => Ok(None),
            // `unwrap` is okay here because of our foreign key constraint
            Some(event_id) => Ok(Some(AuthorizedEvent::load_by_id(event_id, context).await?.unwrap())),
        }
    }

    fn show_title(&self) -> bool {
        self.show_title
    }

    fn id(&self) -> Id {
        self.shared().id
    }

    fn index(&self) -> i32 {
        self.shared().index
    }
}

impl_from_db!(
    BlockValue,
    select: {
        blocks.{
            id, ty: "type", index, text_content, series_id, videolist_order, video_id, show_title,
        },
    },
    |row| {
        let ty: BlockType = row.ty();
        let shared = SharedData {
            id: Id::block(row.id()),
            index: row.index::<i16>().into(),
        };

        match ty {
            BlockType::Title => TitleBlock {
                shared,
                content: unwrap_type_dep(row.text_content(), "title", "text_content"),
            }.into(),

            BlockType::Text => TextBlock {
                shared,
                content: unwrap_type_dep(row.text_content(), "text", "text_content"),
            }.into(),

            BlockType::Series => SeriesBlock {
                shared,
                series: row.series_id::<Option<Key>>().map(Id::series),
                order: unwrap_type_dep(row.videolist_order(), "series", "videolist_order"),
                show_title: unwrap_type_dep(row.show_title(), "series", "show_title"),
            }.into(),

            BlockType::Video => VideoBlock {
                shared,
                event: row.video_id::<Option<Key>>().map(Id::event),
                show_title: unwrap_type_dep(row.show_title(), "event", "show_title"),
            }.into(),
        }
    }
);

/// Helper functions to unwrap a value from DB that should be non-null due to
/// the block type. Panics with a nice error message in case of null.
fn unwrap_type_dep<T>(value: Option<T>, type_name: &str, field_name: &str) -> T {
    value.unwrap_or_else(|| panic!(
        "DB broken: block with type='{}' has null `{}`",
        type_name,
        field_name,
    ))
}

impl BlockValue {
    /// Fetches all blocks for the given realm from the database.
    pub(crate) async fn load_for_realm(realm_key: Key, context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!(
            "select {selection} \
                from blocks \
                where realm_id = $1 \
                order by index asc",
        );
        context.db
            .query_raw(&query, &[realm_key])
            .await?
            .err_into::<ApiError>()
            .map_ok(|row| Self::from_row_start(&row))
            .try_collect()
            .await
            .map_err(Into::into)
    }
}
