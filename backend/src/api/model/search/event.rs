use std::collections::HashMap;

use chrono::{DateTime, Utc};
use juniper::GraphQLObject;
use meilisearch_sdk::search::MatchRange;

use crate::{
    api::{Context, Id, Node, NodeValue},
    auth::HasRoles,
    db::types::TextAssetType,
    search::{self, util::decode_acl},
};
use super::{field_matches_for, match_ranges_for, ByteSpan, SearchRealm};


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
    pub host_realms: Vec<SearchRealm>,
    pub text_matches: Vec<TextMatch>,
    pub matches: SearchEventMatches,
    pub has_password: bool,
    pub user_is_authorized: bool,
}

#[derive(Debug, GraphQLObject, Default)]
pub struct SearchEventMatches {
    title: Vec<ByteSpan>,
    description: Vec<ByteSpan>,
    series_title: Vec<ByteSpan>,
    creators: Vec<ArrayMatch>,
}

#[derive(Debug, GraphQLObject)]
pub struct ArrayMatch {
    index: i32,
    span: ByteSpan,
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
    pub(crate) fn without_matches(src: search::Event, context: &Context) -> Self {
        let read_roles = decode_acl(&src.read_roles);
        let user_can_read = context.auth.overlaps_roles(read_roles, &context.config.auth);
        Self::new_inner(src, vec![], SearchEventMatches::default(), user_can_read)
    }

    pub(crate) fn new(
        src: search::Event,
        match_positions: Option<&HashMap<String, Vec<MatchRange>>>,
        context: &Context,
    ) -> Self {
        let mut text_matches = Vec::new();
        let read_roles = decode_acl(&src.read_roles);
        let user_can_read = context.auth.overlaps_roles(read_roles, &context.config.auth);
        if user_can_read {
            src.slide_texts.resolve_matches(
                match_ranges_for(match_positions, "slide_texts.texts"),
                &mut text_matches,
                TextAssetType::SlideText,
            );
            src.caption_texts.resolve_matches(
                match_ranges_for(match_positions, "caption_texts.texts"),
                &mut text_matches,
                TextAssetType::Caption,
            );
        }

        let matches = SearchEventMatches {
            title: field_matches_for(match_positions, "title"),
            description: field_matches_for(match_positions, "description"),
            series_title: field_matches_for(match_positions, "series_title"),
            creators: match_ranges_for(match_positions, "creators")
                .iter()
                .filter_map(|m| {
                    m.indices.as_ref().and_then(|v| v.get(0)).map(|index| ArrayMatch {
                        span: ByteSpan { start: m.start as u32, len: m.length as u32 },
                        index: *index as i32,
                    })
                })
                .take(8)
                .collect(),
        };

        Self::new_inner(src, text_matches, matches, user_can_read)
    }

    fn new_inner(
        src: search::Event,
        text_matches: Vec<TextMatch>,
        matches: SearchEventMatches,
        user_can_read: bool,
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
            host_realms: src.host_realms.into_iter()
                .map(|r| SearchRealm::without_matches(r))
                .collect(),
            text_matches,
            matches,
            has_password: src.has_password,
            user_is_authorized: user_can_read,
        }
    }
}
