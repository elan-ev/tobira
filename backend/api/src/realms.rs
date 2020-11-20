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
    child_keys: Vec<Key>,
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
        self.child_keys.iter()
            .map(|child| &context.realm_tree.realms[&child])
            .collect()
    }
}

pub(crate) struct Tree {
    pub(crate) realms: HashMap<Key, Realm>,
    from_path: HashMap<String, Key>,
}

impl Tree {
    pub(crate) async fn from_db(db: &Pool) -> anyhow::Result<Self> {
        // We store the nodes of the realm tree in a hash map
        // accessible by the database ID
        let mut realms = db
            .get()
            .await?
            .query_raw(
                "select id, name, parent, path_segment from realms",
                std::iter::empty(),
            )
            .await?
            .map_ok(|row| {
                let key = row.get_key(0);
                Realm {
                    key,
                    name: row.get(1),
                    parent_key: if key == 0 { None } else { Some(row.get_key(2)) },
                    path_segment: row.get(3),
                    child_keys: vec![],
                }
            })
            .map_ok(|realm| (realm.key, realm))
            .try_collect::<HashMap<_, _>>()
            .await?;

        // With this, and the `parent` member of the `Realm`,
        // we already have quick access to the data of a realm's parent.
        // To also get to the children quickly we maintain a corresponding list
        // for each realm
        let keys = realms.values()
            .filter_map(|realm| {
                realm.parent_key.map(|parent_key| (realm.key, parent_key))
            })
            .collect::<Vec<_>>();
        for (key, parent_key) in keys {
            let parent = realms.get_mut(&parent_key)
                .with_context(|| format!("invalid parent {} of {}", parent_key, key))?;
            parent.child_keys.push(key);
        }

        // After this point, we should know the tree structure to be valid.
        // That is, we can now safely panic if we can't find things in our maps/lists;
        // that's totally a bug in this code, then, not an inconsistency in the db.

        // We also need a map from the full path to the proper realm.
        let from_path = index_by_path(&mut realms);

        fn index_by_path(
            realms: &mut HashMap<Key, Realm>,
        ) -> HashMap<String, Key> {

            let mut index = HashMap::new();

            fill_index_recursively(0, "", realms, &mut index);

            fn fill_index_recursively(
                parent: Key,
                full_path: &str,
                realms: &HashMap<Key, Realm>,
                index: &mut HashMap<String, Key>,
            ) {
                index.insert(full_path.to_owned(), parent);

                let parent = &realms[&parent];
                for child_key in &parent.child_keys {
                    let child = &realms[&child_key];
                    let path = [full_path, &child.path_segment].join("/");

                    fill_index_recursively(*child_key, &path, realms, index);
                }
            }

            index
        }

        Ok(Tree { realms, from_path })
    }

    pub(crate) fn get_node(&self, id: &Id) -> Option<&Realm> {
        self.realms.get(&id.key_for(Id::REALM_KIND)?)
    }

    pub(crate) fn root(&self) -> &Realm {
        &self.realms[&0]
    }

    pub(crate) fn from_path(&self, path: &str) -> Option<&Realm> {
        self.from_path.get(path).map(|key| &self.realms[key])
    }
}
