use futures::stream::TryStreamExt;
use juniper::{FieldResult, graphql_object};

use crate::{
    Context, Id, Key,
    model::block::BlockValue,
    util::RowExt,
};


pub(crate) struct Realm {
    key: Key,
    parent_key: Option<Key>,
    name: String,
    full_path: String,
}

impl Realm {
    pub(crate) fn root() -> Self {
        Self {
            key: 0,
            parent_key: None,
            name: String::new(),
            full_path: String::new(),
        }
    }

    pub(crate) async fn load_by_id(id: Id, context: &Context) -> FieldResult<Option<Self>> {
        if let Some(key) = id.key_for(Id::REALM_KIND) {
            Self::load_by_key(key, context).await
        } else {
            Ok(None)
        }
    }

    async fn load_by_key(key: Key, context: &Context) -> FieldResult<Option<Self>> {
        if key == 0 {
            return Ok(Some(Self::root()));
        }

        let result = context.db
            .query_opt(
                "select parent, name, full_path
                    from realms
                    where id = $1",
                &[&(key as i64)],
            )
            .await?
            .map(|row| Self {
                key,
                parent_key: Some(row.get_key(0)),
                name: row.get(1),
                full_path: row.get(2),
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
            return Ok(Some(Self::root()));
        }

        // All non-root paths have to start with `/`.
        if !path.starts_with('/') {
            return Ok(None);
        }

        let result = context.db
            .query_opt(
                "select id, parent, name
                    from realms
                    where full_path = $1",
                &[&path],
            )
            .await?
            .map(|row| Self {
                key: row.get_key(0),
                parent_key: Some(row.get_key(1)),
                name: row.get(2),
                full_path: path,
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
        self.key == 0
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
                "select id, parent, name, full_path
                    from ancestors_of_realm($1)
                    where height <> 0 and id <> 0",
                &[&(self.key as i64)],
            )
            .await?
            .map_ok(|row| {
                Self {
                    key: row.get_key(0),
                    parent_key: Some(row.get_key(1)),
                    name: row.get(2),
                    full_path: row.get(3),
                }
            })
            .try_collect()
            .await?;

        Ok(result)
    }

    /// Returns all immediate children of this realm.
    async fn children(&self, context: &Context) -> FieldResult<Vec<Self>> {
        let result = context.db
            .query_raw(
                "select id, name, full_path
                    from realms
                    where parent = $1",
                &[&(self.key as i64)],
            )
            .await?
            .map_ok(|row| {
                Self {
                    key: row.get_key(0),
                    parent_key: Some(self.key),
                    name: row.get(1),
                    full_path: row.get(2),
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
}
