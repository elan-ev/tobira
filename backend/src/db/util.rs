/// Helper macro to pass arguments to `query_raw` and similar calls.
///
/// Helps you with casting to `&dyn ToSql` and type inference. Note: use `[]` for
/// the macro invocation, e.g. `dbargs![]`.
macro_rules! dbargs {
    () => {
        [] as [&(dyn postgres_types::ToSql + Sync); 0]
    };
    ($($arg:expr),+ $(,)?) => {
        [$($arg as &(dyn postgres_types::ToSql + Sync)),+]
    };
}

pub(crate) use dbargs;
