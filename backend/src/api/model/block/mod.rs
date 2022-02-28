//! Blocks that make up the content of realm pages.

use std::{fmt, error::Error};
use juniper::{graphql_interface, graphql_object, GraphQLEnum};
use postgres_types::{FromSql, ToSql};
use tokio_postgres::Row;

use crate::{
    api::{Context, err::{ApiError, ApiResult, internal_server_err}, Id, model::{series::Series, event::Event}},
    db::types::Key,
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
#[postgres(name = "video_list_layout")]
pub(crate) enum VideoListLayout {
    #[postgres(name = "horizontal")]
    Horizontal,
    #[postgres(name = "vertical")]
    Vertical,
    #[postgres(name = "grid")]
    Grid,
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
    pub(crate) layout: VideoListLayout,
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
    async fn series(&self, context: &Context) -> ApiResult<Option<Series>> {
        match self.series {
            None => Ok(None),
            // `unwrap` is okay here because of our foreign key constraint
            Some(series_id) => Ok(Some(Series::load_by_id(series_id, context).await?.unwrap())),
        }
    }

    fn show_title(&self) -> bool {
        self.show_title
    }

    fn layout(&self) -> VideoListLayout {
        self.layout
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
            Some(event_id) => Ok(Some(Event::load_by_id(event_id, context).await?.unwrap())),
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

impl BlockValue {
    /// Fetches all blocks for the given realm from the database.
    pub(crate) async fn load_for_realm(realm_key: Key, context: &Context) -> ApiResult<Vec<Self>> {
        context.db
            .query_raw(
                &format!(
                    "select {} \
                        from blocks \
                        where realm_id = $1 \
                        order by index asc",
                    Self::COL_NAMES,
                ),
                &[realm_key],
            )
            .await?
            .err_into::<ApiError>()
            .and_then(|row| async move { Self::from_row(row) })
            .try_collect()
            .await
            .map_err(Into::into)
    }

    const COL_NAMES: &'static str
        = "id, type, index, text_content, series_id, videolist_layout, videolist_order, video_id, show_title";

    fn from_row(row: Row) -> ApiResult<Self> {
        let ty: BlockType = row.get(1);
        let shared = SharedData {
            id: Id::block(row.get(0)),
            index: row.get::<_, i16>(2).into(),
        };

        let block = match ty {
            BlockType::Title => TitleBlock {
                shared,
                content: get_type_dependent(&row, 3, "title", "text_content")?,
            }.into(),

            BlockType::Text => TextBlock {
                shared,
                content: get_type_dependent(&row, 3, "text", "text_content")?,
            }.into(),

            BlockType::Series => SeriesBlock {
                shared,
                series: row.get::<_, Option<Key>>(4).map(Id::series),
                layout: get_type_dependent(&row, 5, "videolist", "videolist_layout")?,
                order: get_type_dependent(&row, 6, "videolist", "videolist_order")?,
                show_title: get_type_dependent(&row, 8, "titled", "show_title")?,
            }.into(),

            BlockType::Video => VideoBlock {
                shared,
                event: row.get::<_, Option<Key>>(7).map(Id::event),
                show_title: get_type_dependent(&row, 8, "titled", "show_title")?,
            }.into(),
        };

        Ok(block)
    }
}

/// Helper functions to fetch fields from the table that are bound to a type of
/// block. For example, "text" blocks need to have the "text_content" column
/// set (non-null).
fn get_type_dependent<'a, T: FromSql<'a>>(
    row: &'a Row,
    idx: usize,
    type_name: &str,
    field_name: &str,
) -> ApiResult<T> {
    row.get::<_, Option<_>>(idx).ok_or_else(|| internal_server_err!(
        "DB broken: block with type='{}' has null `{}`",
        type_name,
        field_name,
    ))
}

#[derive(Debug)]
pub(crate) struct BlockTypeError;

impl fmt::Display for BlockTypeError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "wrong block type")
    }
}

impl Error for BlockTypeError {}

// TODO? What about video?
impl TryFrom<BlockValue> for TitleBlock {
    type Error = BlockTypeError;
    fn try_from(block: BlockValue) -> Result<Self, Self::Error> {
        match block {
            BlockValue::TitleBlock(b) => Ok(b),
            _ => Err(BlockTypeError),
        }
    }
}

impl TryFrom<BlockValue> for TextBlock {
    type Error = BlockTypeError;
    fn try_from(block: BlockValue) -> Result<Self, Self::Error> {
        match block {
            BlockValue::TextBlock(b) => Ok(b),
            _ => Err(BlockTypeError),
        }
    }
}

impl TryFrom<BlockValue> for SeriesBlock {
    type Error = BlockTypeError;
    fn try_from(block: BlockValue) -> Result<Self, Self::Error> {
        match block {
            BlockValue::SeriesBlock(b) => Ok(b),
            _ => Err(BlockTypeError),
        }
    }
}
