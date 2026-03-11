use std::collections::HashSet;
use chrono::{DateTime, Utc};
use juniper::{GraphQLEnum, GraphQLInputObject, GraphQLObject};
use tokio_postgres::Row;

use crate::{
    api::{
        Context,
        err::{invalid_input, ApiResult},
    },
    dbargs,
    HasRoles,
};

use super::acl::AclInputEntry;


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

#[derive(Debug, Clone, Copy, PartialEq, Eq, GraphQLEnum)]
pub(crate) enum Visibility {
    // Accessible to anonymous users (`ROLE_ANONYMOUS` in `read_roles`).
    Public,
    // Not accessible to anonymous users.
    Private,
    // Password-protected (has credentials). Not applicable to playlists.
    Protected,
    // Not public but shared with multiple roles.
    Shared,
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
    pub(crate) date_column: &'static str,
    // This just helps to determine whether the table has that column
    // and if that can have only one or multiple entries.
    pub(crate) creator_column: CreatorColumn,
}

pub(crate) enum CreatorColumn {
    // Series have no creator column
    None,
    // Playlists can have a single creator
    Scalar,
    // Events can have multiple creators
    Array,
}


pub(crate) async fn load_writable_for_user<T, C>(
    context: &Context,
    order: SortOrder<C>,
    filter: Option<SearchFilter>,
    offset: i32,
    limit: i32,
    parts: ConnectionQueryParts,
    selection: impl std::fmt::Display,
    mut from_row: impl FnMut(&Row) -> T,
) -> ApiResult<Connection<T>>
where
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
    if context.auth.is_admin(&context.config.auth) {
        acl_filter.push_str(" or true");
    } else {
        user_roles = context.auth.roles_vec();
    };

    // Extract filter values
    let escape_like = |input: &str| -> String {
        format!("%{}%", input
            .replace('\\', r"\\")
            .replace('%', r"\%")
            .replace('_', r"\_")
        )
    };
    let (
        title_filter, desc_filter,
        creators_filter, created_start,
        created_end, visibility,
    ) = match filter {
        Some(f) => (
            f.title.map(|s| escape_like(&s)),
            f.description.map(|s| escape_like(&s)),
            f.creators.and_then(|v| {
                let escaped: Vec<String> = v.into_iter().map(|s| escape_like(&s)).collect();
                (!escaped.is_empty()).then_some(escaped)
            }),
            f.created_start,
            f.created_end,
            f.visibility,
        ),
        None => Default::default(),
    };

    let visibility_clause = match visibility {
        Some(Visibility::Public) => format!(
            "and 'ROLE_ANONYMOUS' = any({table}.read_roles)"
        ),
        Some(Visibility::Private) => format!(
            "and not ('ROLE_ANONYMOUS' = any({table}.read_roles))"
        ),
        Some(Visibility::Protected) => {
            // Playlists can't be password protected
            if parts.table != "playlists" {
                format!("and {table}.credentials is not null")
            } else {
                String::new()
            }
        }
        Some(Visibility::Shared) => format!(
            "and not ('ROLE_ANONYMOUS' = any({table}.read_roles)) \
             and array_length({table}.read_roles, 1) > 1"
        ),
        None => String::new(),
    };

    let creators_clause = match parts.creator_column {
        CreatorColumn::None => {
            // No creator column for series.
            "and ($6::text[] is null or true)".to_string()
        }
        CreatorColumn::Scalar => {
            // Playlists: must match single value.
            format!("and ($6::text[] is null or not exists (\
                select 1 from unnest($6::text[]) as p \
                where not ({table}.creator ilike p)))")
        }
        CreatorColumn::Array => {
            // Events: must match at least one element.
            format!("and ($6::text[] is null or not exists (\
                select 1 from unnest($6::text[]) as p \
                where not exists (\
                    select 1 from unnest({table}.creators) as c where c ilike p)))")
        }
    };

    let date_column = parts.date_column;

    let filter_clauses = format!("\
        and ($2::text is null or {table}.title ilike $2::text) \
        and ($3::text is null or {table}.description ilike $3::text) \
        and ($4::timestamptz is null or {date_column} >= $4::timestamptz) \
        and ($5::timestamptz is null or {date_column} <= $5::timestamptz) \
        {creators_clause} {visibility_clause}\
    ");

    let total_count = context.db.query_one(
        &format!(
            "select count(*) \
                from {table_alias} \
                {acl_filter} \
                {filter_clauses}",
            ),
        &[&user_roles, &title_filter, &desc_filter, &created_start, &created_end, &creators_filter],
    ).await?.get::<_, i64>(0);
    let total_count = total_count.try_into().expect("more than 2^31 items?!");

    let query = format!(
        "select {selection} \
            from {table_alias} \
            {join_clause} \
            {acl_filter} \
            {filter_clauses} \
            order by {sort_column} {sort_order}, {table}.id {sort_order} \
            limit $7 offset $8 \
        ",
        join_clause = parts.join_clause,
        sort_order = order.direction.to_sql(),
        sort_column = order.column.to_sql(),
    );

    // Execute query
    let items = context.db.query_mapped(
        &query,
        dbargs![&user_roles, &title_filter, &desc_filter, &created_start, &created_end, &creators_filter, &(limit as i64), &(offset as i64)],
        |row| from_row(&row),
    ).await?;


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


#[derive(Debug)]
pub(crate) struct AclForDB {
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,
    // todo: add custom and preview roles for events when sent by frontend
    // preview_roles: Option<Vec<String>>,
    // custom_action_roles: Option<CustomActions>,
}

pub(crate) fn convert_acl_input(entries: Vec<AclInputEntry>) -> AclForDB {
    let mut read_roles = HashSet::new();
    let mut write_roles = HashSet::new();
    // let mut preview_roles = HashSet::new();
    // let mut custom_action_roles = CustomActions::default();

    for entry in entries {
        let role = entry.role;
        for action in entry.actions {
            match action.as_str() {
                // "preview" => {
                //     preview_roles.insert(role.clone());
                // }
                "read" => {
                    read_roles.insert(role.clone());
                }
                "write" => {
                    write_roles.insert(role.clone());
                }
                _ => {
                    // custom_action_roles
                    //     .0
                    //     .entry(action)
                    //     .or_insert_with(Vec::new)
                    //     .push(role.clone());
                    todo!();
                }
            };
        }
    }

    AclForDB {
        read_roles: read_roles.into_iter().collect(),
        write_roles: write_roles.into_iter().collect(),
        // todo: add custom and preview roles when sent by frontend
        // preview_roles: preview_roles.into_iter().collect(),
        // custom_action_roles,
    }
}

#[derive(GraphQLInputObject)]
pub(crate) struct BasicMetadata {
    pub(crate) title: String,
    pub(crate) description: Option<String>,
}

#[derive(GraphQLInputObject)]
pub(crate) struct SearchFilter {
    pub(crate) title: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) created_start: Option<DateTime<Utc>>,
    pub(crate) created_end: Option<DateTime<Utc>>,
    pub(crate) creators: Option<Vec<String>>,
    pub(crate) visibility: Option<Visibility>,
}
