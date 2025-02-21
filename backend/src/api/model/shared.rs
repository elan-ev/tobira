use juniper::{GraphQLEnum, GraphQLObject};

use crate::{
    api::{
        Context,
        err::{invalid_input, ApiResult},
    },
    db,
    dbargs,
    HasRoles,
};


/// Generates an enum for custom table sort columns and a sort order struct.
///
/// The enum holds all sort columns that are possible for a specific table and also includes
/// a default value.
/// This also includes an implementation of `ToSqlColumn` for the enum, which is used to convert
/// the individual variants to the actual SQL column name.
///
/// The order struct holds the actual sort column as an enum variant, and the sort direction,
/// which is always either `Ascending` or `Descending`.
/// It has a `From` implementation to convert the struct to a `SortOrder` struct,
/// and a `Default` implementation to set the default sort column and direction.
///
/// Note that some sort columns might require special join clauses in the query.
/// These must be defined in the `ConnectionQueryParts` struct input parameter for
/// the `load_writable_for_user` function.
///
/// Example usage:
/// ```
/// define_sort_column_and_order!(
///     pub enum SeriesSortColumn {
///         Title    => "title",
///         #[default]
///         Created  => "created",
///         Updated  => "updated",
///     };
/// );
/// ```
///
/// This will generate the following code:
/// ```
/// #[derive(Debug, Clone, Copy, GraphQLEnum)]
/// pub enum SeriesSortColumn {
///     Title,
///     #[default]
///     Created,
///     Updated,
/// }
/// #[derive(Debug, Clone, Copy, GraphQLInputObject)]
/// pub struct SeriesSortOrder {
///     pub column: SeriesSortColumn,
///     pub direction: SortDirection,
/// }
/// impl ToSqlColumn for SeriesSortColumn {
///     fn to_sql_column(&self) -> &'static str {
///         match self {
///             Self::Title => "title",
///             Self::Created => "created",
///             Self::Updated => "updated",
///         }
///     }
/// }
/// ```
macro_rules! define_sort_column_and_order {
    (
        // Default and enum definition
        $vis_enum:vis enum $enum_name:ident {
            $( $(#[$attr:meta])* $variant:ident => $sql:expr ),+ $(,)?
        };
        // Struct definition
        $vis_order:vis struct $order_name:ident
    ) => {
        // Generate enum with optional default.
        #[derive(Debug, Clone, Copy, Default, GraphQLEnum)]
        $vis_enum enum $enum_name {
            $( $(#[$attr])* $variant ),+
        }

        // Generate ToSqlColumn implementation for the enum
        impl ToSqlColumn for $enum_name {
            fn to_sql(&self) -> &'static str {
                match self {
                    $(Self::$variant => $sql),+
                }
            }
        }

        // Generate order struct
        #[derive(Debug, Clone, Copy, GraphQLInputObject)]
        $vis_order struct $order_name {
            pub column: $enum_name,
            pub direction: SortDirection,
        }


        // Generate `Default` implementation for the order struct
        impl Default for $order_name {
            fn default() -> Self {
                Self {
                    column: $enum_name::default(),
                    direction: SortDirection::Descending,
                }
            }
        }

        // Generate `From` implementation to convert order struct to SortOrder<Enum>
        impl From<$order_name> for SortOrder<$enum_name> {
            fn from(order: $order_name) -> Self {
                Self {
                    column: order.column,
                    direction: order.direction,
                }
            }
        }
    };
}

pub(crate) use define_sort_column_and_order;


/// Used to convert enum variants to their respective SQL column names.
pub trait ToSqlColumn {
    fn to_sql(&self) -> &'static str;
}

#[derive(Debug, Clone, Copy)]
pub struct SortOrder<C> {
    pub column: C,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, GraphQLEnum)]
pub enum SortDirection {
    Ascending,
    Descending,
}

impl SortDirection {
    pub fn to_sql(self) -> &'static str {
        match self {
            SortDirection::Ascending => "asc",
            SortDirection::Descending => "desc",
        }
    }
}

#[derive(Debug)]
pub struct Connection<T> {
    pub page_info: PageInfo,
    pub items: Vec<T>,
    pub total_count: i32,
}

#[derive(Debug, Clone, GraphQLObject)]
pub struct PageInfo {
    pub has_next_page: bool,
    pub has_prev_page: bool,
}

pub(crate) struct ConnectionQueryParts {
    pub(crate) table: &'static str,
    pub(crate) alias: Option<&'static str>,
    pub(crate) join_clause: &'static str,
}


pub(crate) async fn load_writable_for_user<T, C>(
    context: &Context,
    order: SortOrder<C>,
    offset: i32,
    limit: i32,
    parts: ConnectionQueryParts,
) -> ApiResult<Connection<T>>
where
    T: db::util::FromDb,
    C: ToSqlColumn,
{
    const MAX_COUNT: i32 = 100;

    // Argument validation
    if limit <= 0 {
        return Err(invalid_input!("argument 'limit' has to be > 0, but is {limit}"));
    }
    if offset < 0 {
        return Err(invalid_input!("argument 'offset' has to be >= 0, but is {offset}"));
    }
    let limit = std::cmp::min(limit, MAX_COUNT);

    let table_alias = match parts.alias {
        Some(a) => format!("{table} as {a}", table = parts.table),
        None => parts.table.to_string(),
    };
    let table = parts.alias.unwrap_or(parts.table);

    let mut acl_filter = format!("where {table}.write_roles && $1 and {table}.read_roles && $1");
    let mut user_roles = vec![];
    if context.auth.is_admin() {
        acl_filter.push_str("or true");
    } else {
        user_roles = context.auth.roles_vec();
    };

    let query = format!(
        "select {selection}, count(*) over() as total_count \
            from {table_alias} \
            {join_clause} \
            {acl_filter} \
            order by {sort_column} {sort_order}, {table}.id {sort_order} \
            limit $2 offset $3 \
        ",
        selection = T::select(),
        join_clause = parts.join_clause,
        sort_order = order.direction.to_sql(),
        sort_column = order.column.to_sql(),
    );

    let mut total_count = 0;

    // Execute query
    let items = context.db.query_mapped(&query, dbargs![&user_roles, &(limit as i64), &(offset as i64)], |row| {
        // Retrieve total count
        total_count = row.get::<_, i64>("total_count");
        // Retrieve actual row data
        T::from_row_start(&row)
    }).await?;

    let total_count = total_count.try_into().expect("more than 2^31 items?!");

    let page_info = PageInfo {
        has_next_page: (offset + limit) < total_count,
        has_prev_page: offset > 0,
    };

    Ok(Connection {
        total_count,
        items,
        page_info,
    })
}
