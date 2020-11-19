use anyhow::Context as _;

use deadpool_postgres::Pool;
use futures::stream::TryStreamExt;
use juniper::graphql_object;
use std::collections::HashMap;

use crate::{
    Context, Id, Key,
    util::RowExt,
};


pub(crate) struct Realm {
    key: Key,
    name: String,
    parent_key: Option<Key>,
    path_segment: String,
}

impl Realm {
    fn walk_up<'a>(&'a self, context: &'a Context) -> impl Iterator<Item = &'a Self> {
        std::iter::successors(
            Some(self),
            move |child| child.parent_key.map(|parent_key| &context.realm_tree.realms[&parent_key])
        )
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

    fn parent_id(&self) -> Option<Id> {
        self.parent_key.map(Id::realm)
    }

    fn path(&self, context: &Context) -> String {
        let mut segments = self.walk_up(context)
            .map(|realm| &*realm.path_segment)
            .collect::<Vec<_>>();
        segments.reverse();
        segments.join("/")
    }

    fn parent(&self, context: &Context) -> Option<&Realm> {
        self.parent_key.map(|parent_key| &context.realm_tree.realms[&parent_key])
    }

    fn parents(&self, context: &Context) -> Vec<&Realm> {
        let mut parents = self.walk_up(context).skip(1).collect::<Vec<_>>();
        parents.reverse();
        parents
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
    from_path: HashMap<String, u64>,
}

impl Tree {
    pub(crate) async fn from_db(db: &Pool) -> anyhow::Result<Self> {
        // We store the nodes of the realm tree in a hash map
        // accessible by the database ID
        let mut realms = db.get().await?
            .query_raw(
                "select id, name, parent, path_segment from realms",
                std::iter::empty(),
            ).await?
            .map_ok(|row| {
                let key = row.get_key(0);
                Realm {
                    key,
                    name: row.get(1),
                    parent_key: if key == 0 { None } else { Some(row.get_key(2)) },
                    path_segment: row.get(3),
                }
            })
            .map_ok(|realm| (realm.key, realm))
            .try_collect::<HashMap<_, _>>().await?;

        // With this, and the `parent` member of the `Realm`,
        // we already have quick access to the data of a realm's parent.
        // To also get to the children quickly we maintain another map.
        let mut children = <HashMap<_, Vec<_>>>::new();

        for Realm { key, parent_key, .. } in realms.values() {
            if let Some(parent_key) = parent_key {
                children.entry(*parent_key).or_default().push(*key);
            }
        }

        // We also need a map from the full path to the proper realm,
        // and conversely, we want to cache the full path inside the realm.
        let from_path = index_by_path(&mut realms, &children)?;

        fn index_by_path(
            realms: &mut HashMap<u64, Realm>,
            children: &HashMap<u64, Vec<u64>>,
        ) -> anyhow::Result<HashMap<String, u64>> {

            let mut index = HashMap::new();

            fill_index_recursively(0, "", realms, children, &mut index)?;

            fn fill_index_recursively(
                parent: u64,
                full_path: &str,
                realms: &mut HashMap<u64, Realm>,
                children: &HashMap<u64, Vec<u64>>,
                index: &mut HashMap<String, u64>,
            ) -> anyhow::Result<()> {

                index.insert(full_path.to_owned(), parent);

                if let Some(current_children) = children.get(&parent) {
                    for child_id in current_children {
                        let child = realms.get(child_id).context("realm structure invalid")?;
                        let path = [full_path, &child.path_segment].join("/");

                        fill_index_recursively(*child_id, &path, realms, children, index)?;
                    }
                }

                Ok(())
            }

            Ok(index)
        }

        Ok(Tree { realms, children, from_path })
    }

    pub(crate) fn get_node(&self, id: &Id) -> Option<&Realm> {
        self.realms.get(&id.key_for(Id::REALM_KIND)?)
    }

    pub(crate) fn root(&self) -> &Realm {
        self.realms.get(&0).unwrap()
    }

    pub(crate) fn from_path(&self, path: &str) -> Option<&Realm> {
        self.realms.get(self.from_path.get(path)?)
    }
}
