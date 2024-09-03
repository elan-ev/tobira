use chrono::{DateTime, Utc};
use juniper::GraphQLObject;
use meilisearch_sdk::MatchRange;

use crate::{
    api::{Context, Id, Node, NodeValue},
    db::types::TextAssetType,
    search,
};


#[derive(Debug, GraphQLObject)]
#[graphql(Context = Context, impl = NodeValue)]
pub(crate) struct SearchEvent {
    pub id: Id,
    pub series_id: Option<Id>,
    pub series_title: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub creators: Vec<String>,
    pub thumbnail: Option<String>,
    pub duration: f64,
    pub created: DateTime<Utc>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub is_live: bool,
    pub audio_only: bool,
    pub host_realms: Vec<search::Realm>,
    pub text_matches: Vec<TextMatch>,
}

#[derive(Debug, GraphQLObject)]
pub struct ByteSpan {
    pub start: i32,
    pub len: i32,
}

/// A match inside an event's texts while searching.
#[derive(Debug, GraphQLObject)]
pub struct TextMatch {
    /// Start of this timespan in number of milliseconds from the beginning of
    /// the video.
    pub start: f64,

    /// Duration of this timespan in number of milliseconds.
    pub duration: f64,

    /// The text containing the match, with some context
    pub text: String,

    /// Source of this text.
    pub ty: TextAssetType,

    /// Parts of `text` that should be highlighted.
    pub highlights: Vec<ByteSpan>,
}

impl Node for SearchEvent {
    fn id(&self) -> Id {
        self.id
    }
}

impl SearchEvent {
    pub(crate) fn new(
        src: search::Event,
        slide_matches: &[MatchRange],
        caption_matches: &[MatchRange],
    ) -> Self {
        let mut text_matches = Vec::new();
        src.slide_texts.resolve_matches(slide_matches, &mut text_matches, TextAssetType::SlideText);
        src.caption_texts.resolve_matches(caption_matches, &mut text_matches, TextAssetType::Caption);

        Self {
            id: Id::search_event(src.id.0),
            series_id: src.series_id.map(|id| Id::search_series(id.0)),
            series_title: src.series_title,
            title: src.title,
            description: src.description,
            creators: src.creators,
            thumbnail: src.thumbnail,
            duration: src.duration as f64,
            created: src.created,
            start_time: src.start_time,
            end_time: src.end_time,
            is_live: src.is_live,
            audio_only: src.audio_only,
            host_realms: src.host_realms,
            text_matches,
        }
    }
}
