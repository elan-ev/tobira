use std::future::Future;
use tokio_postgres::{RowStream, Error, Row};

use crate::prelude::*;


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


/// Collects all rows of the given raw query result into a vector, but mapping
/// each row to a given type.
pub(crate) async fn collect_rows_mapped<R, F, O>(rows: R, from_row: F) -> Result<Vec<O>, Error>
where
    R: Future<Output = Result<RowStream, Error>>,
    F: FnMut(Row) -> O,
{
    rows.await?
        .map_ok(from_row)
        .try_collect::<Vec<_>>()
        .await
}
