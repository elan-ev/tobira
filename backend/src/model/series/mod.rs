use juniper::GraphQLObject;

use super::ThumbnailInfo;


#[derive(Debug, GraphQLObject)]
pub(crate) struct SeriesThumbnailStack {
    pub(crate) thumbnails: Vec<ThumbnailInfo>,
}
