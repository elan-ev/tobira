use tokio_postgres::types::ToSql;
use juniper::{GraphQLEnum, GraphQLInputObject, GraphQLObject};

use crate::{
    api::{
        Context,
        err::{invalid_input, ApiResult},
    },
    db,
    FromDb,
    HasRoles,
};



#[derive(Debug, Clone, Copy)]
pub struct SortOrder<C> {
    pub column: C,
    pub direction: SortDirection,
}

pub trait ToSqlColumn {
    fn to_sql(&self) -> &'static str;
}

/// Generates an enum for custom table sort columns and a sort order struct.
/// The enum holds all sort columns that are possible for a specific table and also includes
/// a default value.
/// The order struct holds the actual sort column as an enum variant, and the sort direction,
/// which is always either `Ascending` or `Descending`.
/// Also includes implementations for the `ToSqlColumn` and `Default` traits of the enum.
///
/// Example usage:
/// ```
/// define_sort_column_and_order!(
///     pub enum SeriesSortColumn {
///         default = Created,
///         Title    => "title",
///         Created  => "created",
///         Updated  => "updated",
///     };
///     pub struct SeriesSortOrder
/// );
/// ```
///
/// This will generate the following code:
/// ```
/// #[derive(Debug, Clone, Copy, GraphQLEnum)]
/// pub enum SeriesSortColumn {
///     Title,
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
/// impl Default for SeriesSortColumn {
///     fn default() -> Self {
///         Self::Created
///     }
/// }
/// ```
macro_rules! define_sort_column_and_order {
    (
        // Default and enum definition
        $vis_enum:vis enum $enum_name:ident {
            default = $default:ident,
            $($variant:ident => $sql:expr),+ $(,)?
        };
        // Struct definition
        $vis_order:vis struct $order_name:ident
    ) => {
        // Generate enum
        #[derive(Debug, Clone, Copy, GraphQLEnum)]
        $vis_enum enum $enum_name {
            $($variant),+
        }

        // Generate order struct
        #[derive(Debug, Clone, Copy, GraphQLInputObject)]
        $vis_order struct $order_name {
            pub column: $enum_name,
            pub direction: SortDirection,
        }

        impl ToSqlColumn for $enum_name {
            fn to_sql(&self) -> &'static str {
                match self {
                    $(Self::$variant => $sql),+
                }
            }
        }

        impl Default for $enum_name {
            fn default() -> Self {
                Self::$default
            }
        }
    };
}


define_sort_column_and_order!(
    pub enum SeriesSortColumn {
        default = Created,
        Title    => "title",
        Created  => "created",
        Updated  => "updated",
        EventCount => "count(events.id)",
    };
    pub struct SeriesSortOrder
);

define_sort_column_and_order!(
    pub enum VideosSortColumn {
        default = Created,
        Title    => "title",
        Created  => "created",
        Updated  => "updated",
        Series   => "series",
    };
    pub struct VideosSortOrder
);


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
    pub has_previous_page: bool,
    pub start_index: Option<i32>,
    pub end_index: Option<i32>,
}

pub type AssetMapping<ResourceMapping> = ResourceMapping;

pub trait LoadableAsset: FromDb<RowMapping: Copy> {
    fn selection() -> (String, <Self as FromDb>::RowMapping);
    fn table_name() -> &'static str;
}

pub(crate) async fn load_writable_for_user<T, C>(
    context: &Context,
    order: SortOrder<C>,
    offset: i32,
    limit: i32,
) -> ApiResult<Connection<T>>
where
    T: LoadableAsset + db::util::FromDb,
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

    let mut args = vec![];
    let arg_user_roles = &context.auth.roles_vec() as &(dyn ToSql + Sync);
    let acl_filter = if context.auth.is_admin() {
        String::new()
    } else {
        args.push(arg_user_roles);
        let arg_index = args.len();
        format!("where write_roles && ${arg_index} and read_roles && ${arg_index}")
    };

    let table = T::table_name();

    // We need to know the item count before querying the actual items,
    // to check if the offset is too high. If it is, it's set to the maximum.
    let total_count = {
        let query = format!("select count(*) from {table} {acl_filter}");
        context.db.query_one(&query, &args).await?.get::<_, i64>(0)
    };

    let offset = ((offset as i64).clamp(0, (total_count - limit as i64).max(0))) as i32;
    let sort_order = order.direction.to_sql();

    let (selection, mapping) = T::selection();

    let (join_clause, group_by_clause, sort_column) = match order.column.to_sql() {
        "count(events.id)" => (
            "left join events on events.series = series.id",
            "group by series.id",
            "count(events.id)"
        ),
        _ => ("", "", order.column.to_sql()),
    };

    let query = format!(
        "select {selection} \
            from {table} \
            {join_clause} \
            {acl_filter} \
            {group_by_clause} \
            order by {sort_column} {sort_order}, {table}.id {sort_order} \
            limit {limit} offset {offset} \
        ",
    );

    // Execute query
    let items = context.db.query_mapped(&query, args, |row| {
        // Retrieve actual event data
        T::from_row(&row, mapping)
    }).await?;

    let total_count = total_count.try_into().expect("more than 2^31 items?!");

    let page_info = PageInfo {
        has_next_page: (offset + limit) < total_count,
        has_previous_page: offset > 0,
        start_index: (!items.is_empty()).then_some(offset + 1),
        end_index: (!items.is_empty()).then_some(offset + items.len() as i32),
    };

    Ok(Connection {
        total_count,
        items,
        page_info,
    })
}
