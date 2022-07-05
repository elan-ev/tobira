use std::{future::Future, fmt};
use postgres_types::FromSql;
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


// ==============================================================================================

/// A utility trait for types that can be created by querying some columns from
/// the database.
///
/// To implement this trait for a type, you very likely want to use the
/// `impl_from_db` helper macro to avoid writing repeating boilerplate code.
///
/// Once implemented, you would first obtain an `SqlSelection` and a
/// `RowMapping`. The former is just something to interpolate into your query,
/// while the latter is some data that associates each column with an index in
/// the query. If you *only* need to select columns from this type, use the
/// `select*` family of methods. If you also need to select other columns, use
/// the `select!` macro.
///
/// A typical example looks roughly like this:
///
/// ```ignore
/// use crate::db::{
///     types::Key,
///     util::{impl_from_db, FromDb},
/// };
///
/// struct Foo {
///     key: Key,
///     title: String,
///     age: Option<u8>,
/// }
///
/// impl_from_db!(Foo, "foos", { id, title, age }, |row| {
///     Self {
///         key: row.id(),
///         title: row.title(),
///         age: row.age(),
///     }
/// })
///
///
/// // Using it
/// let (selection, mapping) = Foo::select();
/// let query = format!("select {selection} from foos");
/// db.query(&query, dbargs![])
///     .await?
///     .map(|row| Foo::from_row(&row, mapping))
/// ```
///
/// One limitation of this trait is (currently) that it does not allow arbitrary
/// SQL expressions for selection, but only simple column names. Basically.
/// This is just due to how the table name is prefixed with `table.` in front
/// of each column expression.
pub(crate) trait FromDb {
    /// List of all the columns that have to be selected to create this type.
    const COLUMNS: &'static [&'static str];

    /// Name of the table that this is loaded from by default. Can be
    /// overwritten/omitted when loading from renamed/joined/temporary tables.
    const DEFAULT_TABLE: &'static str;

    /// A type that maps each column to an index, so that the column's data can
    /// be retrieved by index from the row.
    type RowMapping: RowMapping;

    /// Provided method that just combines `raw_row` and `mapping` into
    /// `Self::RowView` and calls `from_row_view`.
    fn from_row(raw_row: &Row, mapping: Self::RowMapping) -> Self;

    /// Returns `sql_selection()` plus the appropriate trivial mapping.
    fn select() -> (SqlSelection<'static>, Self::RowMapping) {
        (Self::sql_selection(), Self::RowMapping::from_offset(0))
    }

    /// Returns `sql_selection_without_table()` plus the appropriate trivial mapping.
    fn select_without_table() -> (SqlSelection<'static>, Self::RowMapping) {
        (Self::sql_selection_without_table(), Self::RowMapping::from_offset(0))
    }

    /// Returns `sql_selection_with_table()` plus the appropriate trivial mapping.
    fn select_from_table(table: &str) -> (SqlSelection<'_>, Self::RowMapping) {
        (Self::sql_selection_with_table(table), Self::RowMapping::from_offset(0))
    }

    /// Returns a selection of columns with the default table name, e.g.
    /// `table.col_a, table.col_b`.
    fn sql_selection() -> SqlSelection<'static> {
        SqlSelection {
            table: Some(Self::DEFAULT_TABLE),
            columns: Self::COLUMNS,
        }
    }

    /// Returns a selection of columns without any table prefix, e.g. `col_a, col_b`.
    fn sql_selection_without_table() -> SqlSelection<'static> {
        SqlSelection {
            table: None,
            columns: Self::COLUMNS,
        }
    }

    /// Returns a selection of columns with the given table name prefixed,
    /// e.g. `banana.col_a, banana.col_b` if "banana" is passed.
    fn sql_selection_with_table(table: &str) -> SqlSelection<'_> {
        SqlSelection {
            table: Some(table),
            columns: Self::COLUMNS,
        }
    }
}

/// A mapping from row to index. This trait defintion does not capture the
/// actual use of types implementing the interface. These types are usually
/// structs generated by macros and contain a `FieldIndex` field for each
/// column.
pub(crate) trait RowMapping {
    fn from_offset(offset: u8) -> Self;
}

/// Helper type that is used in `RowMapping` types. Basically just a u8, but
/// with a helpful `of` method.
#[derive(Clone, Copy, Debug)]
pub(crate) struct FieldIndex(u8);

impl FieldIndex {
    pub(crate) fn new(index: u8) -> Self {
        Self(index)
    }

    pub(crate) fn of<'a, T: FromSql<'a>>(&self, row: &'a Row) -> T {
        row.get(self.0 as usize)
    }
}

/// A list of selected fields/columns in a query. Can be formatted with `{}`
/// (via `Display`) to interpolate it into a query.
pub(crate) struct SqlSelection<'a> {
    table: Option<&'a str>,
    columns: &'static [&'static str],
}

impl fmt::Display for SqlSelection<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, col) in self.columns.iter().enumerate() {
            if i != 0 {
                f.write_str(", ")?;
            }
            match self.table {
                Some(table) => write!(f, "{table}.{col}")?,
                None => f.write_str(col)?,
            }
        }
        Ok(())
    }
}


// The following macros are a bit involved. Well, they are rather straight
// forward if you know some basics like internal rules, "push down
// accumulation" and more. It's very useful to have read the basics of "The
// Little Book of Rust Macros".

/// Helper macro to implement `FromDb` to avoid repetition and boilerplate code.
///
/// Syntax/parameters:
///
/// ```ignore
/// impl_from_db!(
///     TypeName,
///     "default_table",
///     { foo, bar, baz: "renamed" },  // The columns to select
///     |row| { /* ... */ }
/// );
/// ```
///
/// Each column definition can either be a simple identifier or an identifier
/// followed by a colon and string literal. The latter syntax is only useful to
/// rename a column, e.g. in case of Rust keywords. The former syntax `foo` is
/// equivalent to `foo: "foo"`.
///
/// The last argument (the closure looking thing) is a function that needs to
/// return `TypeName`. The type of the `row` argument is an anonymous generated
/// type that has a method for each column with the following signature:
/// `fn<T: FromSql<'_>>(&self) -> T`.
///
/// The generated types created by this macro look like this(with the invocation
/// above):
///
/// ```ignore
/// struct TypeNameRowMapping {
///     foo: FieldIndex,
///     bar: FieldIndex,
///     baz: FieldIndex,
/// }
///
/// pub(crate) struct TypeNameRowView {
///     mapping: TypeNameRowMapping,
///     row: tokio_postgres::row::Row,
/// }
///
/// impl TypeNameRowView {
///     fn foo<'a, T: FromSql<'a>>(&'a self) -> T { ... }
///     fn bar<'a, T: FromSql<'a>>(&'a self) -> T { ... }
///     fn baz<'a, T: FromSql<'a>>(&'a self) -> T { ... }
/// }
/// ```
macro_rules! impl_from_db {
    ($ty:ident, $default_table:literal,
        { $( $field:ident $(: $sql:literal )?  ),+ $(,)? },
        |$row:ident| { $($body:tt)* }
    ) => {
        // Wrap in `paste` to create new type names.
        paste::paste! {
            #[derive(Clone, Copy)]
            pub(crate) struct [<$ty RowMapping>] {
                $(
                    $field: crate::db::util::FieldIndex,
                )+
            }

            impl crate::db::util::RowMapping for [<$ty RowMapping>] {
                fn from_offset(offset: u8) -> Self {
                    crate::db::util::impl_from_db!(@init_mapping offset, 0, ( $($field),+ ) -> ())
                }
            }

            pub(crate) struct [<$ty RowView>]<'a> {
                mapping: [<$ty RowMapping>],
                raw_row: &'a tokio_postgres::row::Row,
            }

            impl<'a> [<$ty RowView>]<'a> {
                $(
                    fn $field<T: tokio_postgres::types::FromSql<'a>>(&self) -> T {
                        self.mapping.$field.of(&self.raw_row)
                    }
                )+
            }

            impl crate::db::util::FromDb for $ty {
                const COLUMNS: &'static [&'static str] = &[
                    $( crate::db::util::impl_from_db!(@sql_expr $field $(: $sql)?) ),+
                ];
                const DEFAULT_TABLE: &'static str = $default_table;
                type RowMapping = [<$ty RowMapping>];

                fn from_row(raw_row: &tokio_postgres::row::Row, mapping: Self::RowMapping) -> Self {
                    let $row = [<$ty RowView>] { raw_row, mapping};
                    { $($body)* }
                }
            }
        }
    };

    // Helper to extract the actual SQL string from the two syntax options.
    (@sql_expr $field:ident : $sql:literal) => { $sql };
    (@sql_expr $field:ident) => { stringify!($field) };

    // Helper to implement `from_offset`. This is a bit involved because we need
    // to count up. We use a recursive solution here as the recursion limit
    // will likely not be a problem, given that tables usually don't have a ton
    // of columns.
    (@init_mapping
        $offset:ident, $num:expr, ( $first:ident $(, $label:ident )* ) -> ($($body:tt)*) ) =>
    {
        crate::db::util::impl_from_db!(@init_mapping $offset, $num + 1, ( $($label),* ) -> (
            $($body)*
            $first: crate::db::util::FieldIndex::new($offset + $num),
        ))
    };
    (@init_mapping $offset:ident, $num:expr, () -> ($($body:tt)*) ) => {
        Self { $($body)* }
    };
}

pub(crate) use impl_from_db;


/// Macro to create ad-hoc SQL selections and mappings for queries that don't
/// just query all the columns of a `FromDb` type. Returns a pair of
/// `(selection, mapping)` where `selection` is a `String` and `mapping`
/// is an anonymous struct type containing one field for each
/// input "parameter".
///
/// Example:
///
/// ```
/// let (selection, mapping) = select!(
///     foo,
///     animals: Animal,
///     bar: "len(name)",
///     friends: Animal on "friends",
/// );
/// ```
///
/// Syntax/arguments: a comma-separated list of things to select. Possible
/// syntaxes for each of these things:
///
/// - `some_identifier`: simplest case. This exact identifier is queried in SQL
///   and the returned `mapping` type has a `FieldIndex` field with that name.
///
/// - `some_identifier: "sql expression"`: Same as before, but the SQL string is
///   specified explicitly and can be an arbitrary SQL expression.
///
/// - `some_identifier: SomeType`: where the type has to implement `FromDb`.
///   This has the effect that all columns of that type are added to the
///   selection and the field `some_identifier` has the type
///   `<SomeType as FromDb>::RowMapping`.
///
/// - `some_identifier: SomeType on "table"`: Same as the previous, but instead
///   of using `<SomeType as FromDb>::sql_selection()`, the selection
///   `sql_selection_with_table("table")` is used.
///
/// - `some_identifier: SomeType on none`: Same as previous, but
///   `sql_selection_without_table` is used.
///
macro_rules! select {
    ($($label:ident $(: $source:tt $(on $table:tt)? )? ),+ $(,)?) => {{
        #[derive(Clone, Copy)]
        struct Mapping {
            $(
                $label: crate::db::util::select!(@mapping_field_type $($source)? ),
            )+
        }

        use std::fmt::Write;

        let mapping = crate::db::util::select!(@indices_init 0u8, ( $($label $(: $source)? ),+ ) -> ());
        let mut sql = String::new();
        $(
            write!(sql, "{}, ", crate::db::util::select!(@to_sql $label $(: $source $(on $table)? )?)).unwrap();
        )+
        sql.truncate(sql.len() - 2); // remove the last ", "

        (sql, mapping)
    }};

    // Helper to get the type of the field in the mapping type for different column types.
    (@mapping_field_type ) => { crate::db::util::FieldIndex };
    (@mapping_field_type $source:literal) => { crate::db::util::FieldIndex };
    (@mapping_field_type $source:ident) => { <$source as crate::db::util::FromDb>::RowMapping };

    // Helper to get the part of the selection string for different column types.
    (@to_sql $label:ident) => { stringify!($label) };
    (@to_sql $label:ident : $source:literal) => { $source };
    (@to_sql $label:ident : $source:ident) => { <$source as crate::db::util::FromDb>::sql_selection() };
    (@to_sql $label:ident : $source:ident on none) => {
        <$source as crate::db::util::FromDb>::sql_selection_without_table()
    };
    (@to_sql $label:ident : $source:ident on $table:literal) => {
        <$source as crate::db::util::FromDb>::sql_selection_without_table($table)
    };

    // Helper to create the correct mapping. Again, this involved counting and
    // we again use a recursive solution.
    (@indices_init
        $num:expr,
        ( $first:ident $(: $first_source:literal)? $(, $label:ident $(: $source:tt)?)* )
        -> ($($body:tt)*)
    ) => {
        crate::db::util::select!(@indices_init $num + 1u8, ( $($label $(: $source )? ),* ) -> (
            $($body)*
            $first: crate::db::util::FieldIndex::new($num),
        ))
    };
    (@indices_init
        $num:expr,
        ( $first:ident : $first_source:ident $(, $label:ident $(: $source:tt)?)* )
        -> ($($body:tt)*)
    ) => {
        crate::db::util::select!(@indices_init
            $num + <$first_source as crate::db::util::FromDb>::COLUMNS.len() as u8,
            ( $($label $(: $source )? ),* ) -> (
                $($body)*
                $first: <
                    <$first_source as crate::db::util::FromDb>::RowMapping
                        as crate::db::util::RowMapping
                >::from_offset($num),
            )
        )
    };
    (@indices_init $num:expr, () -> ($($body:tt)*) ) => {
        Mapping { $($body)* }
    };
}

pub(crate) use select;
