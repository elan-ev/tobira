use tokio_postgres::Row;

use crate::Key;


/// Extension trait to add some useful methods to the `Row` type.
pub(crate) trait RowExt {
    /// Retrieves a `bigint` value at the given index as `u64` from the row.
    fn get_key(&self, index: usize) -> Key;
}

impl RowExt for Row {
    fn get_key(&self, index: usize) -> Key {
        // This is fine for two reasons:
        // - Our keys are auto-incremented and once the signed int max value is
        //   reached, inserting more rows results in errors. So we only stored
        //   positive integers. Positive integers have the same bit pattern in
        //   `u64` and `i64`.
        // - Even if negative values would be inside the database, as none of
        //   those negative values is special cased, we can easily cast. The
        //   cast is just a reinterpret cast and cannot fail.
        self.get::<_, i64>(index) as u64
    }
}
