use deadpool_postgres::Pool;
use futures::{stream::TryStreamExt, TryStream};
use juniper::graphql_object;
use std::collections::HashMap;

use crate::{Context, Id, Key};


pub(crate) const KIND_PREFIX: &[u8; 2] = b"re";

pub(crate) struct Realm {
    key: Key,
    name: String,
    parent_key: Key,
}

#[graphql_object(Context = Context)]
impl Realm {
    fn id(&self) -> Id {
        Id::new(KIND_PREFIX, self.key)
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn parent_id(&self) -> Id {
        Id::new(KIND_PREFIX, self.parent_key)
    }

    fn parent(&self, context: &Context) -> &Realm {
        &context.realm_tree.realms[&self.parent_key]
    }

    fn children(&self, context: &Context) -> Vec<&Realm> {
        context.realm_tree.children.get(&self.key)
            .map(|children| {
                children.iter()
                    .map(|child_key| &context.realm_tree.realms[&child_key])
                    .collect()
            })
            .unwrap_or_default()
    }
}

pub(crate) struct Tree {
    pub(crate) realms: HashMap<u64, Realm>,
    children: HashMap<u64, Vec<u64>>,
}

impl Tree {
    pub(crate) async fn raw_from_db(
        db: &Pool,
    ) -> anyhow::Result<impl TryStream<Ok = Realm, Error = impl std::error::Error>> {
        let row_stream = db.get().await?
            .query_raw(
                "select id, name, parent from realms",
                std::iter::empty(),
            ).await?;

        Ok(row_stream.map_ok(|row| Realm {
            key: row.get::<_, i64>(0) as u64,
            name: row.get(1),
            parent_key: row.get::<_, i64>(2) as u64,
        }))
    }

    pub(crate) async fn from_db(db: &Pool) -> anyhow::Result<Self> {
        // We store the nodes of the realm tree in a hash map
        // accessible by the database ID
        let realms = Self::raw_from_db(db).await?
            .map_ok(|realm| (realm.key, realm))
            .try_collect::<HashMap<_, _>>().await?;

        // With this, and the `parent` member of the `Realm`,
        // we already have quick access to the data of a realm's parent.
        // To also get to the children quickly we maintain another map.
        let mut children = <HashMap<_, Vec<_>>>::new();

        for Realm { key, parent_key, .. } in realms.values() {
            if key != parent_key {
                children.entry(*parent_key).or_default().push(*key);
            }
        }

        Ok(Tree { realms, children })
    }

    pub(crate) fn get_node(&self, id: &Id) -> Option<&Realm> {
        self.realms.get(&id.key_for(*KIND_PREFIX)?)
    }

    pub(crate) fn root(&self) -> &Realm {
        self.realms.get(&0).expect("bug: no root realm")
    }
}
