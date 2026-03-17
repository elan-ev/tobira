use std::fmt;

use postgres_types::FromSql;
use serde::Serialize;


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
