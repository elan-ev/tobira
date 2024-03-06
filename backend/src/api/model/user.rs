use crate::{
    api::{
        Context,
        common::Cursor,
        err::ApiResult,
        model::event::{AuthorizedEvent, EventConnection, EventSortOrder},
    },
    auth::User,
    prelude::*,
};


#[juniper::graphql_object(context = Context)]
impl User {
    /// The username, a unique string identifying the user.
    fn username(&self) -> &str {
        &self.username
    }

    fn email(&self) -> Option<&str> {
        self.email.as_deref()
    }

    /// Roles of the user. Note: the frontend should not do any role matching itself,
    /// but should rely on Boolean API endpoints like `canUpload` or `event.canWrite`.
    /// This endpoint is only for debugging and for special cases like the ACL selector.
    fn roles(&self) -> Vec<&str> {
        self.roles.iter().map(AsRef::as_ref).collect()
    }

    /// Returns the *user role* of this user. Each user has exactly one and this
    /// role is used in ACLs to give access to a single user. This role is
    /// always also contained in `roles`.
    fn user_role(&self) -> &str {
        &self.user_role
    }

    /// The name of the user intended to be read by humans.
    fn display_name(&self) -> &str {
        &self.display_name
    }

    /// `True` if the user has the permission to upload videos.
    fn can_upload(&self, context: &Context) -> bool {
        self.can_upload(&context.config.auth)
    }

    /// `True` if the user has the permission to use Opencast Studio.
    fn can_use_studio(&self, context: &Context) -> bool {
        self.can_use_studio(&context.config.auth)
    }

    /// `True` if the user has the permission to use Opencast Studio.
    fn can_use_editor(&self, context: &Context) -> bool {
        self.can_use_editor(&context.config.auth)
    }

    fn can_create_user_realm(&self, context: &Context) -> bool {
        self.can_create_user_realm(&context.config.auth)
    }

    /// `True` if the user is allowed to find unlisted items when editing page content.
    fn can_find_unlisted(&self, context: &Context) -> bool {
        context.auth.can_find_unlisted_items(&context.config.auth)
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
        AuthorizedEvent::load_writable_for_user(context, order, first, after, last, before).await
    }
}
