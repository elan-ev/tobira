//! Blocks that make up the content of realm pages.

use anyhow::anyhow;
use futures::TryStreamExt;
use juniper::{graphql_interface, graphql_object, FieldResult, GraphQLEnum, GraphQLObject};
use postgres_types::FromSql;

use tobira_util::prelude::*;
use tokio_postgres::Row;
use crate::{Context, Id, id::Key, model::series::Series, util::RowExt};


/// A `Block`: a UI element that belongs to a realm.
#[graphql_interface(Context = Context, for = [Text, VideoList])]
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
#[graphql(Context = Context, impl = BlockValue)]
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

pub(crate) struct VideoList {
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

/// A block just showing the list of videos in an Opencast series
#[graphql_object(Context = Context, impl = BlockValue)]
impl VideoList {
    async fn series(&self, context: &Context) -> FieldResult<Series> {
        // `unwrap` is okay here because of our foreign key constraint
        Ok(Series::load_by_id(self.series, context).await?.unwrap())
    }

    fn layout(&self) -> VideoListLayout {
        self.layout
    }

    fn order(&self) -> VideoListOrder {
        self.order
    }
}

impl BlockValue {
    /// Fetches all blocks for the given realm from the database.
    pub(crate) async fn load_for_realm(realm_key: Key, context: &Context) -> FieldResult<Vec<Self>> {
        context.db.get()
            .await?
            .query_raw(
                "select id, type, index, title, text_content, videolist_series,
                    videolist_layout, videolist_order
                    from blocks
                    where realm_id = $1
                    order by index asc",
                &[realm_key as i64],
            )
            .await?
            .err_into::<anyhow::Error>()
            .and_then(|row| async move { Self::from_row(row) })
            .try_collect()
            .await
            .map_err(Into::into)
    }

    fn from_row(row: Row) -> Result<BlockValue> {
        let ty: BlockType = row.get(1);
        let shared = SharedData {
            id: Id::block(row.get_key(0)),
            index: row.get::<_, i16>(2).into(),
            title: row.get(3),
        };

        let block = match ty {
            BlockType::Text => {
                Text {
                    shared,
                    content: get_type_dependent(&row, 4, "text", "text_content")?,
                }.into()
            }
            BlockType::VideoList => {
                VideoList {
                    shared,
                    series: Id::series(
                        get_type_dependent::<i64>(
                            &row,
                            5,
                            "videolist",
                            "videolist_series",
                        )? as u64
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
) -> Result<T> {
    row.get::<_, Option<_>>(idx)
        .ok_or(anyhow!("DB broken: block with type='{}' has null `{}`", type_name, field_name))
}
