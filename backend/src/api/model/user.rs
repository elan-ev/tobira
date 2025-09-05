use crate::{
    api::{
        Context,
        err::ApiResult,
        model::event::AuthorizedEvent,
    },
    auth::User,
    prelude::*,
};

use super::{
    event::VideosSortOrder,
    series::{Series, SeriesSortOrder},
    shared::{Connection, SearchFilter},
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

    /// The part of the user realm path after `@`, i.e. `/@${user_realm_handle}`.
    /// Equals the username, unless overwritten by the auth integration.
    pub fn user_realm_handle(&self) -> &str {
        self.user_realm_handle.as_deref().unwrap_or(&self.username)
    }

    /// `True` if the user has the permission to upload videos.
    fn can_upload(&self, context: &Context) -> bool {
        HasRoles::can_upload(self, &context.config.auth)
    }

    /// `True` if the user has the permission to use Opencast Studio.
    fn can_use_studio(&self, context: &Context) -> bool {
        HasRoles::can_use_studio(self, &context.config.auth)
    }

    /// `True` if the user has the permission to use Opencast Editor.
    fn can_use_editor(&self, context: &Context) -> bool {
        HasRoles::can_use_editor(self, &context.config.auth)
    }

    fn can_create_user_realm(&self, context: &Context) -> bool {
        HasRoles::can_create_user_realm(self, &context.config.auth)
    }

    /// `True` if the user is allowed to find unlisted items when editing page content.
    fn can_find_unlisted(&self, context: &Context) -> bool {
        context.auth.can_find_unlisted_items(&context.config.auth)
    }

    /// `True` if the user has the permission to create new series.
    fn can_create_series(&self, context: &Context) -> bool {
        HasRoles::can_create_series(self, &context.config.auth)
    }

    /// Returns all events that somehow "belong" to the user, i.e. that appear
    /// on the "my videos" page. This also returns events that have been marked
    /// as deleted (meaning their deletion in Opencast has been requested but they
    /// are not yet removed from Tobira's database).
    async fn my_videos(
        &self,
        context: &Context,
        #[graphql(default)]
        order: VideosSortOrder,
        offset: i32,
        limit: i32,
        #[graphql(default)]
        filter: Option<SearchFilter>,
    ) -> ApiResult<Connection<AuthorizedEvent>> {
        AuthorizedEvent::load_writable_for_user(context, order.into(), offset, limit, filter).await
    }

    /// Returns all series that somehow "belong" to the user, i.e. that appear
    /// on the "my series" page.
    async fn my_series(
        &self,
        context: &Context,
        #[graphql(default)]
        order: SeriesSortOrder,
        offset: i32,
        limit: i32,
        #[graphql(default)]
        filter: Option<SearchFilter>,
    ) -> ApiResult<Connection<Series>> {
        Series::load_writable_for_user(context, order.into(), offset, limit, filter).await
    }
}
