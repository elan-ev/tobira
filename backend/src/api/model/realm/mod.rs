use juniper::{graphql_object, GraphQLEnum};
use postgres_types::{FromSql, ToSql};

use crate::{
    api::{Context, Id, err::ApiResult, Node, NodeValue},
    db::types::Key,
    prelude::*,
};
use super::block::BlockValue;


mod mutations;

pub(crate) use mutations::{ChildIndex, NewRealm, RemovedRealm, UpdateRealm, RealmSpecifier};


#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "realm_order")]
pub(crate) enum RealmOrder {
    #[postgres(name = "by_index")]
    ByIndex,
    #[postgres(name = "alphabetic:asc")]
    AlphabeticAsc,
    #[postgres(name = "alphabetic:desc")]
    AlphabeticDesc,
}

pub(crate) struct Realm {
    pub(crate) key: Key,
    parent_key: Option<Key>,
    name: String,
    path_segment: String,
    full_path: String,
    index: i32,
    child_order: RealmOrder,
}

impl Realm {
    pub(crate) async fn root(context: &Context) -> ApiResult<Self> {
        let row = context.db
            .query_one("select child_order from realms where id = 0", &[])
            .await?;

        Ok(Self {
            key: Key(0),
            parent_key: None,
            name: String::new(),
            path_segment: String::new(),
            full_path: String::new(),
            index: 0,
            child_order: row.get(0),
        })
    }

    pub(crate) async fn load_by_id(id: Id, context: &Context) -> ApiResult<Option<Self>> {
        if let Some(key) = id.key_for(Id::REALM_KIND) {
            Self::load_by_key(key, context).await
        } else {
            Ok(None)
        }
    }

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> ApiResult<Option<Self>> {
        if key.0 == 0 {
            return Ok(Some(Self::root(context).await?));
        }

        context.db
            .query_opt(
                &format!(
                    "select {} \
                        from realms \
                        where id = $1",
                    Self::col_names("realms"),
                ),
                &[&key],
            )
            .await?
            .map(Self::from_row)
            .pipe(Ok)
    }

    pub(crate) fn col_names(from: &str) -> String {
        ["id", "parent", "name", "path_segment", "full_path", "index", "child_order"]
            .map(|column| format!("{}.{}", from, column))
            .join(",")
    }

    pub(crate) fn from_row(row: tokio_postgres::Row) -> Self {
        Self {
            key: row.get(0),
            parent_key: row.get(1),
            name: row.get(2),
            path_segment: row.get(3),
            full_path: row.get(4),
            index: row.get(5),
            child_order: row.get(6),
        }
    }

    pub(crate) async fn load_by_path(mut path: String, context: &Context) -> ApiResult<Option<Self>> {
        // Normalize path: strip optional trailing slash.
        if path.ends_with('/') {
            path.pop();
        }

        // Check for root realm.
        if path.is_empty() {
            return Ok(Some(Self::root(context).await?));
        }

        // All non-root paths have to start with `/`.
        if !path.starts_with('/') {
            return Ok(None);
        }

        context.db
            .query_opt(
                &format!(
                    "select {} \
                        from realms \
                        where full_path = $1",
                    Self::col_names("realms"),
                ),
                &[&path],
            )
            .await?
            .map(Self::from_row)
            .pipe(Ok)
    }
}

#[juniper::graphql_interface]
impl Node for Realm {
    fn id(&self) -> Id {
        Id::realm(self.key)
    }
}

#[graphql_object(Context = Context, impl = NodeValue)]
impl Realm {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn is_root(&self) -> bool {
        self.key.0 == 0
    }

    fn index(&self) -> i32 {
        self.index
    }

    /// Specifies how the children of this realm should be ordered (e.g. in the
    /// navigation list). That's the responsibility of the frontend.
    fn child_order(&self) -> RealmOrder {
        self.child_order
    }

    /// Returns the trailing segment of this realm's path, without any instances of `/`.
    /// Empty for the root realm.
    fn path_segment(&self) -> &str {
        &self.path_segment
    }

    /// Returns the full path of this realm. `"/"` for the root realm. For
    /// non-root realms, the path always starts with `/` and never has a
    /// trailing `/`.
    fn path(&self) -> &str {
        if self.key.0 == 0 { "/" } else { &self.full_path }
    }

    /// Returns the immediate parent of this realm.
    async fn parent(&self, context: &Context) -> ApiResult<Option<Realm>> {
        match self.parent_key {
            Some(parent_key) => Realm::load_by_key(parent_key, context).await,
            None => Ok(None)
        }
    }

    /// Returns all ancestors between the root realm to this realm
    /// (excluding both, the root realm and this realm). It starts with a
    /// direct child of the root and ends with the parent of `self`.
    async fn ancestors(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        context.db
            .query_mapped(
                &format!(
                    "select {} \
                        from ancestors_of_realm($1) as ancestors \
                        where height <> 0 and id <> 0",
                    Self::col_names("ancestors"),
                ),
                &[&self.key],
                Self::from_row,
            )
            .await?
            .pipe(Ok)
    }

    /// Returns all immediate children of this realm. The children are always
    /// ordered by the internal index. If `childOrder` returns an ordering
    /// different from `BY_INDEX`, the frontend is supposed to sort the
    /// children.
    async fn children(&self, context: &Context) -> ApiResult<Vec<Self>> {
        context.db
            .query_mapped(
                &format!(
                    "select {} \
                        from realms \
                        where parent = $1 \
                        order by index",
                    Self::col_names("realms"),
                ),
                &[&self.key],
                Self::from_row,
            )
            .await?
            .pipe(Ok)
    }

    /// Returns the (content) blocks of this realm.
    async fn blocks(&self, context: &Context) -> ApiResult<Vec<BlockValue>> {
        // TODO: this method can very easily lead to an N+1 query problem.
        // However, it is unlikely that we ever have that problem: the frontend
        // will only show one realm at a time, so the query will also only
        // request the blocks of one realm.
        BlockValue::load_for_realm(self.key, context).await
    }

    /// Returns the number of realms that are descendants of this one
    /// (excluding this one). Returns a number ≥ 0.
    async fn number_of_descendants(&self, context: &Context) -> ApiResult<i32> {
        let count = context.db
            .query_one(
                "select count(*) from realms where full_path like $1 || '/%'",
                &[&self.full_path],
            )
            .await?
            .get::<_, i64>(0);

        Ok(count.try_into().expect("number of descendants overflows i32"))
    }

    fn can_current_user_edit(&self, context: &Context) -> bool {
        // TODO: at some point, we want ACLs per realm
        context.user.is_moderator(&context.config.auth)
    }

    /// Returns `true` if this realm somehow references the given node via
    /// blocks. Currently, the following rules are used:
    ///
    /// - If `id` refers to a series: returns `true` if the realm has a series
    ///   block with that series.
    /// - If `id` refers to an event: returns `true` if the realm has a video
    ///   block with that video OR if the realm has a series block with that
    ///   event's series.
    /// - Otherwise, `false` is returned.
    async fn references(&self, id: Id, context: &Context) -> ApiResult<bool> {
        if let Some(event_key) = id.key_for(Id::EVENT_KIND) {
            let query = "select exists(\
                select 1 \
                from blocks \
                where realm_id = $1 and ( \
                    video_id = $2 or \
                    series_id = (select series from events where id = $2) \
                )\
            )";
            context.db.query_one(&query, &[&self.key, &event_key])
                .await?
                .get::<_, bool>(0)
                .pipe(Ok)
        } else if let Some(series_key) = id.key_for(Id::SERIES_KIND) {
            let query = "select exists(\
                select 1 from blocks where realm_id = $1 and series_id = $2\
            )";
            context.db.query_one(&query, &[&self.key, &series_key])
                .await?
                .get::<_, bool>(0)
                .pipe(Ok)
        } else {
            Ok(false)
        }
    }
}
