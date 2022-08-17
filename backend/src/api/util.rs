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
