use juniper::{graphql_object, GraphQLEnum, GraphQLObject, GraphQLUnion, graphql_interface};
use postgres_types::{FromSql, ToSql};

use crate::{
    api::{Context, Id, err::ApiResult, Node, NodeValue},
    db::{types::Key, util::{select, impl_from_db}},
    prelude::*,
};
use super::block::{Block, BlockValue, SeriesBlock, VideoBlock};


mod mutations;

pub(crate) use mutations::{
    ChildIndex, NewRealm, RemovedRealm, UpdateRealm, UpdatedRealmName, RealmSpecifier,
};


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

#[derive(Debug, GraphQLUnion)]
#[graphql(context = Context)]
pub(crate) enum RealmNameSource {
    Plain(PlainRealmName),
    Block(RealmNameFromBlock),
}

/// A simple realm name: a fixed string.
#[derive(Debug, GraphQLObject)]
#[graphql(context = Context)]
pub(crate) struct PlainRealmName {
    name: String,
}

#[derive(Debug)]
pub(crate) struct RealmNameFromBlock {
    block: Key,
}

/// A realm name that is derived from a block of that realm.
#[graphql_object(Context = Context)]
impl RealmNameFromBlock {
    async fn block(&self, context: &Context) -> ApiResult<RealmNameSourceBlockValue> {
        match BlockValue::load_by_key(self.block, context).await? {
            BlockValue::VideoBlock(b) => Ok(RealmNameSourceBlockValue::VideoBlock(b)),
            BlockValue::SeriesBlock(b) => Ok(RealmNameSourceBlockValue::SeriesBlock(b)),
            _ => unreachable!("block {:?} has invalid type for name source", self.block),
        }
    }
}

#[graphql_interface(Context = Context, for = [SeriesBlock, VideoBlock])]
pub(crate) trait RealmNameSourceBlock: Block {
    // TODO: we repeat the `id` method here from the `Block` and `Node` trait.
    // This should be done in a better way. Since the Octobor 2021 spec,
    // interfaces can implement other interfaces. Juniper will support this in
    // the future.
    fn id(&self) -> Id;
}

impl RealmNameSourceBlock for SeriesBlock {
    fn id(&self) -> Id {
        self.shared.id
    }
}

impl RealmNameSourceBlock for VideoBlock {
    fn id(&self) -> Id {
        self.shared.id
    }
}

impl Block for RealmNameSourceBlockValue {
    fn shared(&self) -> &super::block::SharedData {
        match self {
            Self::SeriesBlock(b) => b.shared(),
            Self::VideoBlock(b) => b.shared(),
        }
    }
}


pub(crate) struct Realm {
    pub(crate) key: Key,
    parent_key: Option<Key>,
    plain_name: Option<String>,
    resolved_name: Option<String>,
    name_from_block: Option<Key>,
    path_segment: String,
    full_path: String,
    index: i32,
    child_order: RealmOrder,
}

/// SQL join expression that is used in almost all realm-related queries.
pub(crate) const REALM_JOINS: &str = "\
    left join blocks on blocks.id = name_from_block \
    left join events on blocks.video_id = events.id \
    left join series on blocks.series_id = series.id \
";

impl_from_db!(
    Realm,
    select: {
        realms.{ id, parent, name, name_from_block, path_segment, full_path, index, child_order },
        resolved_name:
            "coalesce(${table:realms}.name, ${table:series}.title, ${table:events}.title)",
    },
    |row| {
        Self {
            key: row.id(),
            parent_key: row.parent(),
            plain_name: row.name(),
            resolved_name: row.resolved_name(),
            name_from_block: row.name_from_block(),
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
            plain_name: None,
            resolved_name: None,
            name_from_block: None,
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

        let selection = Self::select();
        let query = format!("select {selection} from realms {REALM_JOINS} where realms.id = $1");
        context.db
            .query_opt(&query, &[&key])
            .await?
            .map(|row| Self::from_row_start(&row))
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

        let selection = Self::select();
        let query = format!("select {selection} \
            from realms {REALM_JOINS} \
            where realms.full_path = $1");
        context.db
            .query_opt(&query, &[&path])
            .await?
            .map(|row| Self::from_row_start(&row))
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

    /// The name of this realm or `null` if there is no name (for some reason).
    /// To find out why a realm has no name, you have to check `name_source`
    /// which gives you the raw information about the realm name.
    fn name(&self) -> Option<&str> {
        self.resolved_name.as_deref()
    }

    /// The raw information about the name of the realm, showing where the name
    /// is coming from and if there is no name, why that is. Is `null` for the
    /// root realm, non-null for all other realms.
    fn name_source(&self) -> Option<RealmNameSource> {
        if let Some(name) = &self.plain_name {
            Some(RealmNameSource::Plain(PlainRealmName {
                name: name.clone(),
            }))
        } else if let Some(block) = self.name_from_block {
            Some(RealmNameSource::Block(RealmNameFromBlock { block }))
        } else {
            None
        }
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
        let selection = Self::select().with_renamed_table("realms", "ancestors");
        let query = format!(
            "select {selection} \
                from ancestors_of_realm($1) as ancestors \
                {REALM_JOINS} \
                where ancestors.id <> 0",
        );
        context.db
            .query_mapped(&query, &[&self.key], |row| Self::from_row_start(&row))
            .await?
            .pipe(Ok)
    }

    /// Returns all immediate children of this realm. The children are always
    /// ordered by the internal index. If `childOrder` returns an ordering
    /// different from `BY_INDEX`, the frontend is supposed to sort the
    /// children.
    async fn children(&self, context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!(
            "select {selection} \
                from realms \
                {REALM_JOINS} \
                where realms.parent = $1 \
                order by index",
        );
        context.db
            .query_mapped(
                &query,
                &[&self.key],
                |row| Self::from_row_start(&row),
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
