use juniper::{
    BoxFuture, ExecutionResult, Executor, GraphQLType, GraphQLValue, GraphQLValueAsync,
    Registry, ScalarValue, Selection, Value, marker::IsOutputType, meta::MetaType,
};

use crate::{
    api::{Context, err::ApiResult},
    auth::{User, UserData},
    prelude::*,
};

use super::event::{Event, EventSortOrder};


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
    #[graphql(arguments(order(default = Default::default())))]
    async fn my_videos(
        &self,
        order: EventSortOrder,
        context: &Context,
    ) -> ApiResult<Vec<Event>> {
        Event::load_writable_for_user(context, order).await
    }
}


// Manually implement juniper traits for `User`, semantically equivalent to `Option<UserData>`.
// It's terribly verbose, and 90% just copied from the corresponding `Option<T>` impls, but
// I guess this is the best we can do.

impl<S: ScalarValue> GraphQLValue<S> for User {
    type Context = <UserData as GraphQLValue>::Context;
    type TypeInfo = <UserData as GraphQLValue>::TypeInfo;

    fn type_name(&self, _: &Self::TypeInfo) -> Option<&'static str> {
        None
    }

    fn resolve(
        &self,
        info: &Self::TypeInfo,
        _: Option<&[Selection<S>]>,
        executor: &Executor<Self::Context, S>,
    ) -> ExecutionResult<S> {
        match self {
            Self::Some(user_data) => executor.resolve(info, user_data),
            Self::None => Ok(Value::null()),
        }
    }
}

impl<S: ScalarValue + Send + Sync> GraphQLValueAsync<S> for User {
    fn resolve_async<'a>(
        &'a self,
        info: &'a Self::TypeInfo,
        _: Option<&'a [Selection<S>]>,
        executor: &'a Executor<Self::Context, S>,
    ) -> BoxFuture<'a, ExecutionResult<S>> {
        let f = async move {
            let value = match self {
                Self::Some(obj) => executor.resolve_into_value_async(info, obj).await,
                Self::None => Value::null(),
            };
            Ok(value)
        };
        Box::pin(f)
    }
}

impl<S: ScalarValue> GraphQLType<S> for User {
    fn name(_: &Self::TypeInfo) -> Option<&'static str> {
        None
    }

    fn meta<'r>(info: &Self::TypeInfo, registry: &mut Registry<'r, S>) -> MetaType<'r, S>
    where
        S: 'r,
    {
        registry.build_nullable_type::<UserData>(info).into_meta()
    }
}

impl<S: ScalarValue> IsOutputType<S> for User {
    fn mark() {
        <UserData as IsOutputType<S>>::mark()
    }
}
