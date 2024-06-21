use std::{future::Future, fmt, collections::HashMap};
use postgres_types::FromSql;
use tokio_postgres::{binary_copy::BinaryCopyInWriter, Error, Row, RowStream};

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

pub(crate) async fn bulk_insert(
    table: &str,
    columns: &[&str],
    tx: &deadpool_postgres::Transaction<'_>,
) -> Result<BinaryCopyInWriter> {
    let col_list = columns.join(", ");
    let placeholders = (1..=columns.len())
        .map(|i| format!("${i}"))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!("insert into {table} ({col_list}) values ({placeholders})");
    let col_types = tx.prepare_cached(&sql).await?;

    let sink = tx.copy_in(&format!("copy {table} ({col_list}) from stdin binary")).await?;
    Ok(BinaryCopyInWriter::new(sink, col_types.params()))
}


// ==============================================================================================

/// A utility trait for types that can be created by querying some columns from
/// the database.
///
/// To implement this trait for a type, you very likely want to use the
/// `impl_from_db` helper macro to avoid writing repeating boilerplate code.
///
/// To actually query this type:
///
/// - If you only query this type, you can use `Foo::select()` to get a
///   selection that only contains the selections/columns of `Foo`. Interpolate
///   that into your SQL query. Once you have a row, call `from_row_start` to
///   obtain your type.
///
/// - If you want to query more things than just the columns for a single
///   `FromDb` type, you have to use the `select!` macro. It returns a
///   selection, but also a mapping to keep track of indices.
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
/// impl_from_db!(
///     Foo,
///     select: {
///         foos.{ id, title, age },
///     },
///     |row| {
///         Self {
///             key: row.id(),
///             title: row.title(),
///             age: row.age(),
///         }
///     },
/// )
///
///
/// // Using it
/// let selection = Foo::select();
/// let query = format!("select {selection} from foos");
/// db.query(&query, dbargs![])
///     .await?
///     .map(|row| Foo::from_row_start(&row))
/// ```
pub(crate) trait FromDb {
    /// List of all the columns that have to be selected to create this type.
    ///
    /// To allow flexible selection from multiple different tables, these
    /// strings are allowed to contain placeholders for table names that look
    /// like this: `${table:...}`, where `...` is a specific table name. For
    /// example, `${table:events}` would refer to the table `events`. Having
    /// this special syntax for it makes it possible to change a table name for
    /// one selection. This is done with `SqlSelection::with_renamed_table`.
    /// Sometimes it is also useful to just omit the table prefix alltogether,
    /// which can be done with `SqlSelection::with_omitted_table_prefix`. Here,
    /// We are extra smart about things and if there is a `.` immediately after
    /// the placeholder, that is removed as well.
    const COLUMNS: &'static [&'static str];

    /// A type that maps each column to an index, so that the column's data can
    /// be retrieved by index from the row.
    type RowMapping: RowMapping;

    /// Central function creating `Self` from a row and a mapping.
    fn from_row(raw_row: &Row, mapping: Self::RowMapping) -> Self;

    /// Create `Self` from the row assuming that all columns of `Self` are at
    /// the start of the row. Useful if you don't use `select!`, but
    /// `Self::select` to only retrieve this one type.
    fn from_row_start(raw_row: &Row) -> Self
    where
        Self: Sized,
    {
        Self::from_row(raw_row, Self::RowMapping::from_offset(0))
    }

    /// Returns `sql_selection()` plus the appropriate trivial mapping.
    fn select() -> SqlSelection<'static> {
        SqlSelection::new(Self::COLUMNS)
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
/// (via `Display`) to interpolate it into a query. Interprets `${table:...}`
/// placeholder as described on `FromDb::Columns`.
pub(crate) struct SqlSelection<'a> {
    columns: &'static [&'static str],
    table_renames: HashMap<&'a str, Option<&'a str>>,
}

impl<'a> SqlSelection<'a> {
    fn new(columns: &'static [&'static str]) -> Self {
        Self {
            columns,
            table_renames: HashMap::new(),
        }
    }

    /// Renames a table.
    ///
    /// For example, the column selection `${table:foo}.banana` would normally
    /// be emitted as `foo.banana`. To instead output `bar.banana`, call
    /// `.with_renamed_table("foo", "bar")`.
    pub(crate) fn with_renamed_table(mut self, from: &'a str, to: &'a str) -> Self {
        self.table_renames.insert(from, Some(to));
        self
    }

    /// Removes the table prefix for a specific table completely.
    ///
    ///
    /// For example, the column selection `${table:foo}.banana` would normally
    /// be emitted as `foo.banana`. To instead output just `banana`, call
    /// `.with_omitted_table_prefix("foo")`.
    pub(crate) fn with_omitted_table_prefix(mut self, table: &'a str) -> Self {
        self.table_renames.insert(table, None);
        self
    }
}

impl fmt::Display for SqlSelection<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, col) in self.columns.iter().enumerate() {
            if i != 0 {
                f.write_str(", ")?;
            }

            const START_TAG: &str = "${table:";

            let mut pos = 0;
            while let Some(start) = col[pos..].find(START_TAG).map(|start| start + pos) {
                // Emit everything until the start of the tag.
                f.write_str(&col[pos..start])?;

                let table_name_start = start + START_TAG.len();
                let mut end = table_name_start + col[table_name_start..]
                    .find("}")
                    .expect("unclosed ${table:...} tag");

                let original_table = &col[table_name_start..end];
                match self.table_renames.get(original_table) {
                    None => f.write_str(original_table)?,
                    Some(Some(new_name)) => f.write_str(&new_name)?,
                    Some(None) => {
                        // We do not emit anything here. And we also check if
                        // the next character is a `.`, in which case we skip
                        // that too.
                        if col[end + 1..].as_bytes()[0] == b'.' {
                            end += 1;
                        }
                    }
                }

                pos = end + 1;
            }

            // Emit the rest of the string
            f.write_str(&col[pos..])?;
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
/// # Example
///
/// ```ignore
/// impl_from_db!(
///     Event,
///     select: {
///         events.{ id, title, description },
///         series.{ series_title: "title" },
///         is_short: "${table:events}.duration < 10000",
///     },
///     |row| {
///         Self {
///             id: row.id(),
///             title: row.title(),
///             description: row.description(),
///             series_title: row.series_title(),
///             is_short: row.is_short(),
///         }
///     },
/// );
/// ```
///
/// Which expands to (slightly beautified):
///
/// ```ignore
/// #[derive(Clone, Copy)]
/// pub(crate) struct EventRowMapping {
///     id: FieldIndex,
///     title: FieldIndex,
///     description: FieldIndex,
///     series_title: FieldIndex,
///     is_short: FieldIndex,
/// }
///
/// impl RowMapping for EventRowMapping {
///     fn from_offset(offset: u8) -> Self {
///         Self {
///             id: FieldIndex::new(offset),
///             title: FieldIndex::new(offset + 1),
///             description: FieldIndex::new(offset + 2),
///             series_title: FieldIndex::new(offset + 3),
///             is_short: FieldIndex::new(offset + 4),
///         }
///     }
/// }
///
/// pub(crate) struct EventRowView<'a> {
///     mapping: EventRowMapping,
///     raw_row: &'a tokio_postgres::row::Row,
/// }
///
/// impl<'a> EventRowView<'a> {
///     fn id<T: tokio_postgres::types::FromSql<'a>>(&self) -> T {
///         self.mapping.id.of(&self.raw_row)
///     }
///     fn title<T: tokio_postgres::types::FromSql<'a>>(&self) -> T {
///         self.mapping.title.of(&self.raw_row)
///     }
///     fn description<T: tokio_postgres::types::FromSql<'a>>(&self) -> T {
///         self.mapping.description.of(&self.raw_row)
///     }
///     fn series_title<T: tokio_postgres::types::FromSql<'a>>(&self) -> T {
///         self.mapping.series_title.of(&self.raw_row)
///     }
///     fn is_short<T: tokio_postgres::types::FromSql<'a>>(&self) -> T {
///         self.mapping.is_short.of(&self.raw_row)
///     }
/// }
///
/// impl FromDb for Event {
///     const COLUMNS: &'static [&'static str] = &[
///         "${table:events}.id",
///         "${table:events}.title",
///         "${table:events}.description",
///         "${table:series}.series_title",
///         "${table:events}.duration < 10000",
///     ];
///     type RowMapping = EventRowMapping;
///     fn from_row(raw_row: &tokio_postgres::row::Row, mapping: Self::RowMapping) -> Self {
///         let row = EventRowView { raw_row, mapping };
///         {
///             Self {
///                 id: row.id(),
///                 title: row.title(),
///                 description: row.description(),
///                 series_title: row.series_title(),
///                 is_short: row.is_short(),
///             }
///         }
///     }
/// }
/// ```
///
///
/// # General Syntax
///
/// ```ignore
/// impl_from_db!(
///     TypeName,   // Type to implement `FromDb` for
///     select: { /* selections */ },
///     |row| { /* fn body */ }
/// );
/// ```
///
/// `selection` is a comma-separated list of two possible forms:
///
/// - `label: "sql expression"`: adds the given SQL expression to the selection
///   list. In Rust code, this is referred to by `label` (in the row mapping
///   and row view). Be sure to use the `${table:...}` placeholder for every
///   reference to any column of a table.
///
/// - `table.{ foo, bar, ty: "type" }`: adds all given column from the table
///   `table` with the appropriate prefix `${table:table}.` to the selection
///   list. Columns can be renamed via `: "sql column"` for columns with names
///   that is a Rust keyword or where a different `.table { ... }` selection
///   already uses that name. Note that the string is still prefixed with
///   `${table:table}.`, so for arbitrary SQL expression, you should not use the
///   `table.{ ... }` syntax.
///
/// Note: while the `table.{ ... }` syntax suggest nesting, the generated row
/// mapping and row view types are flat and contain one field name per singular
/// selection (e.g. column). Thus, `foo.{ id }, bar.{ id }` will lead to a name
/// conflict as there are two struct fields called `id`.
///
///
/// The last argument (the closure looking thing) is a function that needs to
/// return `TypeName`. The type of the `row` argument is an anonymous generated
/// type that has a method for each selected item with the following signature:
/// `fn<T: FromSql<'_>>(&self) -> T`.
///
macro_rules! impl_from_db {
    ($ty:ident,
        select: {
            $( $label:ident $sep:tt $rhs:tt ),+ $(,)?
        },
        |$row:ident| { $($body:tt)* } $(,)?
    ) => {
        crate::db::util::impl_from_db!(@desugar
            ($ty, |$row| { $($body)* }),
            ($( $label $sep $rhs ,)+ ) -> ()
        );
    };

    (@desugar ( $ty:ident, |$row:ident| { $($body:tt)* } ), () -> ($($out:tt)*) ) => {
        crate::db::util::impl_from_db!(@desugared_main
            $ty,
            { $($out)* },
            |$row| { $($body)* }
        );
    };
    (@desugar ( $($fixed:tt)* ),
        ( $label:ident : $sql:literal, $($tail:tt)* )
        -> ($($out:tt)*)
    ) => {
        crate::db::util::impl_from_db!(@desugar ($($fixed)*), ($($tail)*) -> (
            $($out)* $label: $sql,
        ));
    };
    (@desugar ( $($fixed:tt)* ),
        ( $table:ident . { $( $label:ident $(: $sql:literal)? ),+ $(,)? }, $($tail:tt)*)
        -> ($($out:tt)*)
    ) => {
        crate::db::util::impl_from_db!(@desugar ($($fixed)*),
            ($($tail)*) -> ( $($out)* $(
                $label: concat!(
                    "${table:",
                    stringify!($table),
                    "}.",
                    crate::db::util::impl_from_db!(@label_or_sql $label $($sql)?),
                ),
            )+ )
        );
    };

    (@label_or_sql $label:ident) => { stringify!($label) };
    (@label_or_sql $label:ident $sql:literal) => { $sql };


    (@desugared_main $ty:ident,
        { $($label:ident : $sql:expr ,)+ },
        |$row:ident| { $($body:tt)* }
    ) => {
        // Wrap in `paste` to create new type names.
        paste::paste! {
            #[derive(Clone, Copy)]
            pub(crate) struct [<$ty RowMapping>] {
                $( $label: crate::db::util::FieldIndex, )+
            }

            impl crate::db::util::RowMapping for [<$ty RowMapping>] {
                fn from_offset(offset: u8) -> Self {
                    crate::db::util::impl_from_db!(@init_mapping
                        offset, 0, ( $($label),+ ) -> ()
                    )
                }
            }

            pub(crate) struct [<$ty RowView>]<'a> {
                mapping: [<$ty RowMapping>],
                raw_row: &'a tokio_postgres::row::Row,
            }

            impl<'a> [<$ty RowView>]<'a> {
                $(
                    fn $label<T: tokio_postgres::types::FromSql<'a>>(&self) -> T {
                        self.mapping.$label.of(&self.raw_row)
                    }
                )+
            }

            impl crate::db::util::FromDb for $ty {
                const COLUMNS: &'static [&'static str] = &[$( $sql ),+];
                type RowMapping = [<$ty RowMapping>];

                fn from_row(raw_row: &tokio_postgres::row::Row, mapping: Self::RowMapping) -> Self {
                    let $row = [<$ty RowView>] { raw_row, mapping};
                    { $($body)* }
                }
            }
        }
    };

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
///     friends: Animal from Animal::select().with_renamed_table("animals", "friends"),
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
///   specified explicitly and can be an arbitrary SQL expression. Does not
///   support `${table:...}` placeholders!
///
/// - `some_identifier: SomeType`: where the type has to implement `FromDb`.
///   This has the effect that all columns of that type are added to the
///   selection and the field `some_identifier` has the type
///   `<SomeType as FromDb>::RowMapping`.
///
/// - `some_identifier: SomeType from selection`: Same as the previous, but
///   instead of using `<SomeType as FromDb>::select()`, the selection
///   `selection` is used.
///
macro_rules! select {
    ($($label:ident $(: $source:tt $(from $selection:expr)? )? ),+ $(,)?) => {{
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
            write!(
                sql,
                "{}, ",
                crate::db::util::select!(@to_sql $label $(: $source $(from $selection)? )?),
            ).unwrap();
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
    (@to_sql $label:ident : $source:ident) => { <$source as crate::db::util::FromDb>::select() };
    (@to_sql $label:ident : $source:ident from $selection:expr) => { $selection };

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
