use deadpool_postgres::Pool;
use futures::{stream::TryStreamExt, TryStream};
use juniper::graphql_object;
use std::collections::HashMap;

use super::Context;


pub(super) type Id = i32;

pub(super) struct Realm {
    id: Id,
    name: String,
    parent_id: Id,
}

#[graphql_object(Context = Context)]
impl Realm {
    fn id(&self) -> &Id {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn parent_id(&self) -> &Id {
        &self.parent_id
    }

    fn parent(&self, context: &Context) -> &Realm {
        &context.realm_tree.realms[&self.parent_id]
    }

    fn children(&self, context: &Context) -> Vec<&Realm> {
        context.realm_tree.children.get(&self.id)
            .map(|children| {
                children.iter()
                    .map(|child_id| &context.realm_tree.realms[&child_id])
                    .collect()
            })
            .unwrap_or_default()
    }
}

pub(super) struct Tree {
    pub(super) realms: HashMap<Id, Realm>,
    children: HashMap<Id, Vec<Id>>,
}

impl Tree {
    pub(super) async fn raw_from_db(
        db: &Pool,
    ) -> anyhow::Result<impl TryStream<Ok = Realm, Error = impl std::error::Error>> {
        let row_stream = db.get().await?
            .query_raw(
                "select id, name, parent from realms",
                std::iter::empty(),
            ).await?;
        Ok(row_stream.map_ok(|row| Realm {
            id: row.get(0),
            name: row.get(1),
            parent_id: row.get(2),
        }))
    }

    pub(super) async fn from_db(db: &Pool) -> anyhow::Result<Self> {
        // We store the nodes of the realm tree in a hash map
        // accessible by the database ID
        let realms = Self::raw_from_db(db).await?
            .map_ok(|realm| (realm.id, realm))
            .try_collect::<HashMap<_, _>>().await?;

        // With this, and the `parent` member of the `Realm`,
        // we already have quick access to the data of a realm's parent.
        // To also get to the children quickly we maintain another map.
        let mut children = HashMap::<_, Vec<_>>::new();

        for Realm { id, parent_id, .. } in realms.values() {
            if id != parent_id {
                children.entry(*parent_id).or_default().push(*id);
            }
        }

        Ok(Tree { realms, children })
    }

    pub(super) fn get_node(&self, id: &Id) -> Option<&Realm> {
        self.realms.get(id)
    }
}
