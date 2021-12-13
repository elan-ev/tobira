//! Blocks that make up the content of realm pages.

use std::{fmt, error::Error};
use juniper::{graphql_interface, graphql_object, GraphQLEnum};
use postgres_types::{FromSql, ToSql};
use tokio_postgres::Row;

use crate::{
    api::{Context, err::{ApiError, ApiResult, internal_server_err}, Id, model::series::Series},
    db::types::Key,
    prelude::*,
};


mod mutations;

pub(crate) use mutations::{
    NewTextBlock,
    NewSeriesBlock,
    UpdateBlock,
    UpdateTextBlock,
    UpdateSeriesBlock,
    RemovedBlock
};


/// A `Block`: a UI element that belongs to a realm.
#[graphql_interface(Context = Context, for = [TextBlock, SeriesBlock])]
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
    fn title(&self) -> Option<&str> {
        self.shared().title.as_deref()
    }
}

#[derive(Debug, Clone, Copy, FromSql)]
#[postgres(name = "block_type")]
pub(crate) enum BlockType {
    #[postgres(name = "text")]
    Text,
    #[postgres(name = "series")]
    Series,
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
    pub(crate) title: Option<String>,
}

pub(crate) struct TextBlock {
    pub(crate) shared: SharedData,
    pub(crate) content: String,
}

#[graphql_interface]
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

    fn title(&self) -> Option<&str> {
        self.shared().title.as_deref()
    }
}

pub(crate) struct SeriesBlock {
    pub(crate) shared: SharedData,
    pub(crate) series: Id,
    pub(crate) layout: VideoListLayout,
    pub(crate) order: VideoListOrder,
}

#[graphql_interface]
impl Block for SeriesBlock {
    fn shared(&self) -> &SharedData {
        &self.shared
    }
}

/// A block just showing the list of videos in an Opencast series
#[graphql_object(Context = Context, impl = BlockValue)]
impl SeriesBlock {
    async fn series(&self, context: &Context) -> ApiResult<Series> {
        // `unwrap` is okay here because of our foreign key constraint
        Ok(Series::load_by_id(self.series, context).await?.unwrap())
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

    fn title(&self) -> Option<&str> {
        self.shared().title.as_deref()
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
        = "id, type, index, title, text_content, series_id, videolist_layout, videolist_order";

    fn from_row(row: Row) -> ApiResult<Self> {
        let ty: BlockType = row.get(1);
        let shared = SharedData {
            id: Id::block(row.get(0)),
            index: row.get::<_, i16>(2).into(),
            title: row.get(3),
        };

        let block = match ty {
            BlockType::Text => {
                TextBlock {
                    shared,
                    content: get_type_dependent(&row, 4, "text", "text_content")?,
                }.into()
            }
            BlockType::Series => {
                SeriesBlock {
                    shared,
                    series: Id::series(
                        get_type_dependent(&row, 5, "videolist", "series_id")?
                    ),
                    layout: get_type_dependent(&row, 6, "videolist", "videolist_layout")?,
                    order: get_type_dependent(&row, 7, "videolist", "videolist_order")?,
                }.into()
            }
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
