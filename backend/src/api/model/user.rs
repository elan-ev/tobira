use crate::{
    api::{
        Context,
        common::Cursor,
        err::ApiResult,
        model::event::{Event, EventConnection, EventSortOrder},
    },
    auth::UserData,
    prelude::*,
};


#[juniper::graphql_object(name = "User", context = Context)]
impl UserData {
    /// The username, a unique string identifying the user.
    fn username(&self) -> &str {
        &self.username
    }

    /// The name of the user intended to be read by humans.
    fn display_name(&self) -> &str {
        &self.display_name
    }

    /// `True` if the user has the permission to upload videos.
    fn can_upload(&self, context: &Context) -> bool {
        self.can_upload(&context.config.auth)
    }

    /// Returns all events that somehow "belong" to the user, i.e. that appear
    /// on the "my videos" page.
    ///
    /// Exactly one of `first` and `last` must be set!
    #[graphql(arguments(order(default = Default::default())))]
    async fn my_videos(
        &self,
        order: EventSortOrder,
        first: Option<i32>,
        after: Option<Cursor>,
        last: Option<i32>,
        before: Option<Cursor>,
        context: &Context,
    ) -> ApiResult<EventConnection> {
        Event::load_writable_for_user(context, order, first, after, last, before).await
    }
}
