//! Blocks that make up the content of realm pages.

use std::fmt;
use juniper::{graphql_interface, graphql_object, GraphQLEnum};
use postgres_types::{FromSql, ToSql};
use serde::Serialize;

use crate::{
    api::{
        err::{ApiError, ApiResult},
        model::{
            event::{AuthorizedEvent, Event},
            playlist::Playlist,
            realm::Realm,
            series::Series
        },
        Context,
        Id,
    },
    model::Key,
    db::util::impl_from_db,
    prelude::*,
};


pub(crate) mod mutations;

pub(crate) use mutations::{
    NewTitleBlock,
    NewTextBlock,
    NewSeriesBlock,
    NewPlaylistBlock,
    NewVideoBlock,
    UpdateTitleBlock,
    UpdateTextBlock,
    UpdateSeriesBlock,
    UpdatePlaylistBlock,
    UpdateVideoBlock,
    RemovedBlock,
};


/// A `Block`: a UI element that belongs to a realm.
#[graphql_interface(
    Context = Context,
    for = [TitleBlock, TextBlock, SeriesBlock, VideoBlock, PlaylistBlock]
)]
pub(crate) trait Block {
    fn id(&self) -> Id;
    fn index(&self) -> i32;
    async fn realm(&self, context: &Context) -> ApiResult<Realm>;
}

macro_rules! impl_block {
    ($ty:ty) => {
        impl Block for $ty {
            fn id(&self) -> Id {
                self.shared.id
            }
            fn index(&self) -> i32 {
                self.shared.index
            }
            async fn realm(&self, context: &Context) -> ApiResult<Realm> {
                Realm::load_by_key(self.shared.realm_key, context)
                    .await
                    // Foreign key constraints guarantee the realm exists
                    .map(Option::unwrap)
            }
        }
    };
}


#[derive(Debug, Clone, Copy, FromSql, Serialize)]
#[postgres(name = "block_type")]
#[serde(rename_all = "lowercase")]
pub(crate) enum BlockType {
    #[postgres(name = "title")]
    Title,
    #[postgres(name = "text")]
    Text,
    #[postgres(name = "series")]
    Series,
    #[postgres(name = "video")]
    Video,
    #[postgres(name = "playlist")]
    Playlist,
}

impl fmt::Display for BlockType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(f)
    }
}

#[derive(Debug, Clone, Copy, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "video_list_order")]
pub(crate) enum VideoListOrder {
    #[postgres(name = "new_to_old")]
    NewToOld,
    #[postgres(name = "old_to_new")]
    OldToNew,
    #[postgres(name = "a_to_z")]
    AZ,
    #[postgres(name = "z_to_a")]
    ZA,
    #[postgres(name = "original")]
    ORIGINAL,
}

#[derive(Debug, Clone, Copy, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "video_list_layout")]
pub(crate) enum VideoListLayout {
    #[postgres(name = "slider")]
    Slider,
    #[postgres(name = "gallery")]
    Gallery,
    #[postgres(name = "list")]
    List,
}

/// Data shared by all blocks.
#[derive(Debug)]
pub(crate) struct SharedData {
    pub(crate) id: Id,
    pub(crate) index: i32,
    pub(crate) realm_key: Key,
}

#[derive(Debug)]
pub(crate) struct TitleBlock {
    pub(crate) shared: SharedData,
    pub(crate) content: String,
}

impl_block!(TitleBlock);

/// A block just showing some title.
#[graphql_object(Context = Context, impl = BlockValue)]
impl TitleBlock {
    fn content(&self) -> &str {
        &self.content
    }

    fn id(&self) -> Id {
        Block::id(self)
    }

    fn index(&self) -> i32 {
        Block::index(self)
    }

    async fn realm(&self, context: &Context) -> ApiResult<Realm> {
        Block::realm(self, context).await
    }
}

#[derive(Debug)]
pub(crate) struct TextBlock {
    pub(crate) shared: SharedData,
    pub(crate) content: String,
}

impl_block!(TextBlock);

/// A block just showing some text.
#[graphql_object(Context = Context, impl = BlockValue)]
impl TextBlock {
    fn content(&self) -> &str {
        &self.content
    }

    fn id(&self) -> Id {
        Block::id(self)
    }

    fn index(&self) -> i32 {
        Block::index(self)
    }

    async fn realm(&self, context: &Context) -> ApiResult<Realm> {
        Block::realm(self, context).await
    }
}

#[derive(Debug)]
pub(crate) struct SeriesBlock {
    pub(crate) shared: SharedData,
    pub(crate) series: Option<Id>,
    pub(crate) show_title: bool,
    pub(crate) show_metadata: bool,
    pub(crate) order: VideoListOrder,
    pub(crate) layout: VideoListLayout,
}

impl_block!(SeriesBlock);

/// A block just showing the list of videos in an Opencast series
#[graphql_object(Context = Context, impl = [BlockValue])]
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

    fn show_metadata(&self) -> bool {
        self.show_metadata
    }

    fn order(&self) -> VideoListOrder {
        self.order
    }

    fn layout(&self) -> VideoListLayout {
        self.layout
    }

    fn id(&self) -> Id {
        Block::id(self)
    }

    fn index(&self) -> i32 {
        Block::index(self)
    }

    async fn realm(&self, context: &Context) -> ApiResult<Realm> {
        Block::realm(self, context).await
    }
}

#[derive(Debug)]
pub(crate) struct VideoBlock {
    pub(crate) shared: SharedData,
    // Is `None` if the video was removed from the DB.
    pub(crate) event: Option<Id>,
    pub(crate) show_title: bool,
    pub(crate) show_link: bool,
}

impl_block!(VideoBlock);

/// A block for presenting a single Opencast event
#[graphql_object(Context = Context, impl = [BlockValue])]
impl VideoBlock {
    async fn event(&self, context: &Context) -> ApiResult<Option<Event>> {
        match self.event {
            None => Ok(None),
            Some(event_id) => Ok(AuthorizedEvent::load_by_id(event_id, context).await?),
        }
    }

    fn show_title(&self) -> bool {
        self.show_title
    }

    fn show_link(&self) -> bool {
        self.show_link
    }

    fn id(&self) -> Id {
        Block::id(self)
    }

    fn index(&self) -> i32 {
        Block::index(self)
    }

    async fn realm(&self, context: &Context) -> ApiResult<Realm> {
        Block::realm(self, context).await
    }
}

#[derive(Debug)]
pub(crate) struct PlaylistBlock {
    pub(crate) shared: SharedData,
    pub(crate) playlist: Option<Id>,
    pub(crate) show_title: bool,
    pub(crate) show_metadata: bool,
    pub(crate) order: VideoListOrder,
    pub(crate) layout: VideoListLayout,
}

impl_block!(PlaylistBlock);

/// A block just showing the list of videos in an Opencast playlist
#[graphql_object(Context = Context, impl = [BlockValue])]
impl PlaylistBlock {
    async fn playlist(&self, context: &Context) -> ApiResult<Option<Playlist>> {
        match self.playlist {
            None => Ok(None),
            // `unwrap` is okay here because of our foreign key constraint
            Some(playlist_id) => Ok(Some(Playlist::load_by_id(playlist_id, context).await?.unwrap())),
        }
    }

    fn show_title(&self) -> bool {
        self.show_title
    }

    fn show_metadata(&self) -> bool {
        self.show_metadata
    }

    fn order(&self) -> VideoListOrder {
        self.order
    }

    fn layout(&self) -> VideoListLayout {
        self.layout
    }

    fn id(&self) -> Id {
        Block::id(self)
    }

    fn index(&self) -> i32 {
        Block::index(self)
    }

    async fn realm(&self, context: &Context) -> ApiResult<Realm> {
        Block::realm(self, context).await
    }
}

impl_from_db!(
    BlockValue,
    select: {
        blocks.{
            id,
            ty: "type",
            index,
            text_content,
            series,
            videolist_order,
            videolist_layout,
            video,
            show_title,
            show_link,
            show_metadata,
            realm,
            playlist,
        },
    },
    |row| {
        let ty: BlockType = row.ty();
        let shared = SharedData {
            id: Id::block(row.id()),
            index: row.index::<i16>().into(),
            realm_key: row.realm(),
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
                series: row.series::<Option<Key>>().map(Id::series),
                order: unwrap_type_dep(row.videolist_order(), "series", "videolist_order"),
                layout: unwrap_type_dep(row.videolist_layout(), "series", "videolist_layout"),
                show_title: unwrap_type_dep(row.show_title(), "series", "show_title"),
                show_metadata: unwrap_type_dep(row.show_metadata(), "series", "show_metadata"),
            }.into(),

            BlockType::Video => VideoBlock {
                shared,
                event: row.video::<Option<Key>>().map(Id::event),
                show_title: unwrap_type_dep(row.show_title(), "event", "show_title"),
                show_link: unwrap_type_dep(row.show_link(), "event", "show_link"),
            }.into(),

            BlockType::Playlist => PlaylistBlock {
                shared,
                playlist: row.playlist::<Option<Key>>().map(Id::playlist),
                order: unwrap_type_dep(row.videolist_order(), "playlist", "videolist_order"),
                layout: unwrap_type_dep(row.videolist_layout(), "playlist", "videolist_layout"),
                show_title: unwrap_type_dep(row.show_title(), "playlist", "show_title"),
                show_metadata: unwrap_type_dep(row.show_metadata(), "playlist", "show_metadata"),
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
                where realm = $1 \
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

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> ApiResult<Self> {
        let selection = Self::select();
        let query = format!("select {selection} from blocks where id = $1 ");
        context.db
            .query_one(&query, &[&key])
            .await
            .map(|row| Self::from_row_start(&row))
            .map_err(Into::into)
    }

    pub(crate) fn id(&self) -> Id {
        match self {
            BlockValue::TitleBlock(block) => block.shared.id,
            BlockValue::TextBlock(block) => block.shared.id,
            BlockValue::VideoBlock(block) => block.shared.id,
            BlockValue::SeriesBlock(block) => block.shared.id,
            BlockValue::PlaylistBlock(block) => block.shared.id,
        }
    }
}
