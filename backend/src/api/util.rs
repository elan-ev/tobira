
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
use postgres_types::ToSql;

use crate::{api::{Id, id::IdKind}, model::{Key, OpencastId}};


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

    // Currently unused, but might come in handy again at some point.
    #[allow(dead_code)]
    pub fn as_ref(&self) -> LazyLoad<&T> {
        match self {
            LazyLoad::Loaded(t) => LazyLoad::Loaded(t),
            LazyLoad::NotLoaded => LazyLoad::NotLoaded,
        }
    }
}

/// An ID referring to an OC item. Can be `Key`, `Id` or `OpencastId`.
pub trait OcItemId {
    fn column(&self) -> &'static str;
    fn arg(&self, kind: IdKind) -> Option<impl ToSql + Sync>;
}

impl OcItemId for Key {
    fn column(&self) -> &'static str {
        "id"
    }
    fn arg(&self, _kind: IdKind) -> Option<impl ToSql + Sync> {
        Some(*self)
    }
}
impl OcItemId for Id {
    fn column(&self) -> &'static str {
        "id"
    }
    fn arg(&self, kind: IdKind) -> Option<impl ToSql + Sync> {
        self.key_for(kind)
    }
}
impl OcItemId for OpencastId {
    fn column(&self) -> &'static str {
        "opencast_id"
    }
    fn arg(&self, _kind: IdKind) -> Option<impl ToSql + Sync> {
        Some(&**self)
    }
}
