use chrono::{DateTime, Utc};
use juniper::GraphQLObject;

use crate::{
    api::{Context, Id, Node, NodeValue},
    db::types::TextAssetType,
    search,
};
use super::ByteSpan;


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
    pub matches: SearchEventMatches,
}

#[derive(Debug, GraphQLObject, Default)]
pub struct SearchEventMatches {
    title: Vec<ByteSpan>,
    description: Vec<ByteSpan>,
    series_title: Vec<ByteSpan>,
    // TODO: creators
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
    pub(crate) fn without_matches(src: search::Event) -> Self {
        Self::new_inner(src, vec![], SearchEventMatches::default())
    }

    pub(crate) fn new(hit: meilisearch_sdk::SearchResult<search::Event>) -> Self {
        let match_positions = hit.matches_position.as_ref();
        let get_matches = |key: &str| match_positions
            .and_then(|m| m.get(key))
            .map(|v| v.as_slice())
            .unwrap_or_default();

        let field_matches = |key: &str| get_matches(key).iter()
            .map(|m| ByteSpan { start: m.start as i32, len: m.length as i32 })
            .take(8) // The frontend can only show a limited number anyway
            .collect();

        let src = hit.result;


        let mut text_matches = Vec::new();
        src.slide_texts.resolve_matches(
            &get_matches("slide_texts.texts"),
            &mut text_matches,
            TextAssetType::SlideText,
        );
        src.caption_texts.resolve_matches(
            &get_matches("caption_texts.texts"),
            &mut text_matches,
            TextAssetType::Caption,
        );

        let matches = SearchEventMatches {
            title: field_matches("title"),
            description: field_matches("description"),
            series_title: field_matches("series_title"),
        };

        Self::new_inner(src, text_matches, matches)
    }

    fn new_inner(
        src: search::Event,
        text_matches: Vec<TextMatch>,
        matches: SearchEventMatches,
    ) -> Self {
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
            matches,
        }
    }
}
