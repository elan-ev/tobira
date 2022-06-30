use juniper::{graphql_object, GraphQLEnum};
use postgres_types::{FromSql, ToSql};

use crate::{
    api::{Context, Id, err::ApiResult, Node, NodeValue},
    db::{types::Key, util::{select, impl_from_db}},
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

impl_from_db!(
    Realm,
    "realms",
    { id, parent, name, path_segment, full_path, index, child_order },
    |row| {
        Self {
            key: row.id(),
            parent_key: row.parent(),
            name: row.name(),
            path_segment: row.path_segment(),
            full_path: row.full_path(),
            index: row.index(),
            child_order: row.child_order(),
        }
    }
);

impl Realm {
    pub(crate) async fn root(context: &Context) -> ApiResult<Self> {
        let (selection, mapping) = select!(child_order);
        let row = context.db
            .query_one(&format!("select {selection} from realms where id = 0"), &[])
            .await?;

        Ok(Self {
            key: Key(0),
            parent_key: None,
            name: String::new(),
            path_segment: String::new(),
            full_path: String::new(),
            index: 0,
            child_order: mapping.child_order.of(&row),
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

        let (selection, mapping) = Self::select();
        let query = format!("select {selection} from realms where id = $1");
        context.db
            .query_opt(&query, &[&key])
            .await?
            .map(|row| Self::from_row(row, mapping))
            .pipe(Ok)
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

        let (selection, mapping) = Self::select();
        let query = format!("select {selection} from realms where full_path = $1");
        context.db
            .query_opt(&query, &[&path])
            .await?
            .map(|row| Self::from_row(row, mapping))
            .pipe(Ok)
    }
}

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
        let (selection, mapping) = Self::select_from_table("ancestors");
        let query = format!(
            "select {selection} \
                from ancestors_of_realm($1) as ancestors \
                where height <> 0 and id <> 0",
        );
        context.db
            .query_mapped(&query, &[&self.key], |row| Self::from_row(row, mapping))
            .await?
            .pipe(Ok)
    }

    /// Returns all immediate children of this realm. The children are always
    /// ordered by the internal index. If `childOrder` returns an ordering
    /// different from `BY_INDEX`, the frontend is supposed to sort the
    /// children.
    async fn children(&self, context: &Context) -> ApiResult<Vec<Self>> {
        let (selection, mapping) = Self::select();
        let query = format!(
            "select {selection} \
                from realms \
                where parent = $1 \
                order by index",
        );
        context.db
            .query_mapped(
                &query,
                &[&self.key],
                |row| Self::from_row(row, mapping),
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
        context.auth.is_moderator(&context.config.auth)
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
