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
/// deal with the "not allowed" case.
pub(crate) struct NotAllowed;

super::util::impl_object_with_dummy_field!(NotAllowed);
