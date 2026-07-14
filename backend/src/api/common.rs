use crate::{
    api::{
        Id,
        Context,
        model::{
            event::AuthorizedEvent,
            series::Series,
            realm::Realm,
            playlist::AuthorizedPlaylist,
            search::{SearchEvent, SearchRealm, SearchSeries},
        },
    },
    search::Playlist as SearchPlaylist,
};


/// A node with a globally unique ID. Mostly useful for relay.
#[juniper::graphql_interface(
    Context = Context,
    for = [
        AuthorizedEvent,
        AuthorizedPlaylist,
        Realm,
        Series,
        SearchEvent,
        SearchRealm,
        SearchSeries,
        SearchPlaylist,
    ]
)]
pub(crate) trait Node {
    fn id(&self) -> Id;
}

/// Marker type (mostly to be used in unions) to signal that the user is not
/// allowed to access some data.
///
/// This is used instead of GraphQL errors in places where we easily want to
/// deal with the "not allowed" case. When used in a video list context,
/// `opencast_id` is set to identify which entry is not allowed.
pub(crate) struct NotAllowed {
    pub(crate) opencast_id: Option<String>,
}

#[juniper::graphql_object(Context = Context)]
impl NotAllowed {
    /// Unused dummy field for this marker type. GraphQL requires all objects to
    /// have at least one field. Always returns `null`.
    fn dummy() -> Option<bool> {
        None
    }

    fn opencast_id(&self) -> &str {
        self.opencast_id.as_deref().unwrap_or_default()
    }
}
