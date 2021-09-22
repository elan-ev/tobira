use std::convert::TryInto;

use futures::stream::TryStreamExt;
use juniper::{FieldResult, graphql_object, GraphQLEnum};
use postgres_types::{FromSql, ToSql};

use crate::{
    Context, Id, Key,
    model::block::BlockValue,
};


mod mutations;

pub(crate) use mutations::{ChildIndex, NewRealm, RemovedRealm, UpdateRealm};


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
    key: Key,
    parent_key: Option<Key>,
    name: String,
    full_path: String,
    index: i32,
    child_order: RealmOrder,
}

impl Realm {
    pub(crate) async fn root(context: &Context) -> FieldResult<Self> {
        let row = context.db
            .query_one("select child_order from realms where id = 0", &[])
            .await?;

        Ok(Self {
            key: Key(0),
            parent_key: None,
            name: String::new(),
            full_path: String::new(),
            index: 0,
            child_order: row.get(0),
        })
    }

    pub(crate) async fn load_by_id(id: Id, context: &Context) -> FieldResult<Option<Self>> {
        if let Some(key) = id.key_for(Id::REALM_KIND) {
            Self::load_by_key(key, context).await
        } else {
            Ok(None)
        }
    }

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> FieldResult<Option<Self>> {
        if key.0 == 0 {
            return Ok(Some(Self::root(context).await?));
        }

        let result = context.db
            .query_opt(
                "select parent, name, full_path, index, child_order \
                    from realms \
                    where id = $1",
                &[&key],
            )
            .await?
            .map(|row| Self {
                key,
                parent_key: Some(row.get(0)),
                name: row.get(1),
                full_path: row.get(2),
                index: row.get(3),
                child_order: row.get(4),
            });

        Ok(result)
    }

    pub(crate) async fn load_by_path(mut path: String, context: &Context) -> FieldResult<Option<Self>> {
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

        let result = context.db
            .query_opt(
                "select id, parent, name, index, child_order \
                    from realms \
                    where full_path = $1",
                &[&path],
            )
            .await?
            .map(|row| Self {
                key: row.get(0),
                parent_key: Some(row.get(1)),
                name: row.get(2),
                full_path: path,
                index: row.get(3),
                child_order: row.get(4),
            });

        Ok(result)
    }
}

#[graphql_object(Context = Context)]
impl Realm {
    fn id(&self) -> Id {
        Id::realm(self.key)
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

    /// Returns the full path of this realm. `""` for the root realm. For
    /// non-root realms, the path always starts with `/` and never has a
    /// trailing `/`.
    fn path(&self) -> &str {
        &self.full_path
    }

    /// Returns the immediate parent of this realm.
    async fn parent(&self, context: &Context) -> FieldResult<Option<Realm>> {
        match self.parent_key {
            Some(parent_key) => Realm::load_by_key(parent_key, context).await,
            None => Ok(None)
        }
    }

    /// Returns all ancestors between the root realm to this realm
    /// (excluding both, the root realm and this realm).
    async fn ancestors(&self, context: &Context) -> FieldResult<Vec<Realm>> {
        let result = context.db
            .query_raw(
                "select id, parent, name, full_path, index, child_order \
                    from ancestors_of_realm($1) \
                    where height <> 0 and id <> 0",
                &[&self.key],
            )
            .await?
            .map_ok(|row| {
                Self {
                    key: row.get(0),
                    parent_key: Some(row.get(1)),
                    name: row.get(2),
                    full_path: row.get(3),
                    index: row.get(4),
                    child_order: row.get(5),
                }
            })
            .try_collect()
            .await?;

        Ok(result)
    }

    /// Returns all immediate children of this realm. The children are always
    /// ordered by the internal index. If `childOrder` returns an ordering
    /// different from `BY_INDEX`, the frontend is supposed to sort the
    /// children.
    async fn children(&self, context: &Context) -> FieldResult<Vec<Self>> {
        let result = context.db
            .query_raw(
                "select id, name, full_path, index, child_order \
                    from realms \
                    where parent = $1 \
                    order by index",
                &[&self.key],
            )
            .await?
            .map_ok(|row| {
                Self {
                    key: row.get(0),
                    parent_key: Some(self.key),
                    name: row.get(1),
                    full_path: row.get(2),
                    index: row.get(3),
                    child_order: row.get(4),
                }
            })
            .try_collect()
            .await?;

        Ok(result)
    }

    /// Returns the (content) blocks of this realm.
    async fn blocks(&self, context: &Context) -> FieldResult<Vec<BlockValue>> {
        // TODO: this method can very easily lead to an N+1 query problem.
        // However, it is unlikely that we ever have that problem: the frontend
        // will only show one realm at a time, so the query will also only
        // request the blocks of one realm.
        BlockValue::load_for_realm(self.key, context).await
    }

    /// Returns the number of realms that are descendants of this one
    /// (excluding this one). Returns a number ≥ 0.
    async fn number_of_descendants(&self, context: &Context) -> FieldResult<i32> {
        let count = context.db
            .query_one(
                "select count(*) from realms where full_path like $1 || '/%'",
                &[&self.full_path],
            )
            .await?
            .get::<_, i64>(0);

        Ok(count.try_into().expect("number of descendants overflows i32"))
    }
}
