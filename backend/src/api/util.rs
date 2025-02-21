
macro_rules! impl_object_with_dummy_field {
    ($ty:ident) => {
        #[juniper::graphql_object(Context = crate::api::Context)]
        impl $ty {
            /// Unused dummy field for this marker type. GraphQL requires all objects to
            /// have at least one field. Always returns `null`.
            fn dummy() -> Option<bool> {
                None
            }
        }
    };
}

pub(crate) use impl_object_with_dummy_field;


#[derive(Debug, Clone, Copy)]
pub(crate) enum LazyLoad<T> {
    Loaded(T),
    NotLoaded,
}

impl<T> LazyLoad<T> {
    pub fn unwrap(self) -> T {
        match self {
            LazyLoad::Loaded(t) => t,
            LazyLoad::NotLoaded => panic!("unwrapped a unloaded LazyLoad"),
        }
    }

    pub fn as_ref(&self) -> LazyLoad<&T> {
        match self {
            LazyLoad::Loaded(t) => LazyLoad::Loaded(t),
            LazyLoad::NotLoaded => LazyLoad::NotLoaded,
        }
    }
}
