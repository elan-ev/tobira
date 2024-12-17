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


#[derive(Debug, Clone, Copy, GraphQLInputObject)]
pub struct SortOrder {
    pub column: SortColumn,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Copy, GraphQLEnum)]
pub enum SortColumn {
    Title,
    Created,
    Updated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, GraphQLEnum)]
pub enum SortDirection {
    Ascending,
    Descending,
}

impl Default for SortOrder {
    fn default() -> Self {
        Self {
            column: SortColumn::Created,
            direction: SortDirection::Descending,
        }
    }
}

impl SortColumn {
    pub fn to_sql(self) -> &'static str {
        match self {
            SortColumn::Title => "title",
            SortColumn::Created => "created",
            SortColumn::Updated => "updated",
        }
    }
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

pub(crate) async fn load_writable_for_user<T>(
    context: &Context,
    order: SortOrder,
    offset: i32,
    limit: i32,
) -> ApiResult<Connection<T>>
where
    T: LoadableAsset + db::util::FromDb,
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

    let (selection, mapping) = T::selection();

    let query = format!(
        "select {selection} \
            from {table} as resource \
            {acl_filter} \
            order by ({sort_col}, id) {sort_order} \
            limit {limit} offset {offset} \
        ",
        sort_col = order.column.to_sql(),
        sort_order = order.direction.to_sql(),
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
