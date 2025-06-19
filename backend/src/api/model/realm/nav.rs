use juniper::GraphQLObject;

use crate::{
    api::{err::ApiResult, Context},
    db::util::{dbargs, select},
    model::Key,
    prelude::*,
};


#[derive(Debug, GraphQLObject)]
pub(crate) struct RealmNav {
    /// The "go up" part of the navigation, i.e. the logical parent. This is
    /// almost always also the actual parent, except for user root realms,
    /// which have no actual parent, but for which this field points to the
    /// main root realm. Is `null` for only the main root realm.
    up: Option<RealmNavItem>,

    /// Whether the name of the current realm should be shown in an extra
    /// section in the nav. This is `true` except for the main root and leaf
    /// nodes.
    show_self: bool,

    /// Main part of the navigation: list of realms to navigate to. These are
    /// usually the children of the realm, except for leaf nodes (except root
    /// realms), where it's the siblings (including itself) instead.
    list: Vec<RealmNavItem>,

    /// Dictates in what order the items in `list` should be displayed.
    list_order: super::RealmOrder,
}

#[derive(Debug, GraphQLObject)]
pub(crate) struct RealmNavItem {
    /// Resolved name, like `Realm.name`.
    name: Option<String>,
    path: String,
}

impl RealmNav {
    pub(crate) async fn load_for(realm: &super::Realm, context: &Context) -> ApiResult<Self> {
        let (selection, mapping) = select!(
            id,
            full_path,
            name: "case \
          		when name_from_block is null then name \
          		else (\
         			select coalesce(series.title, events.title) \
         			from blocks \
         			left join events on blocks.video = events.id \
         			left join series on blocks.series = series.id \
         			where blocks.id = name_from_block\
          		)\
           	end",
        );
        let sql = format!("\
            select {selection} --full_path, realms.resolved_name
           	from realms
           	where id = $2
           	or parent = case
          		when exists(select from realms where parent = $1) then $1
          		else $2
           	end
            order by index asc");

        let mut list = vec![];
        let mut up = None;
        let mut show_self = true;
        context.db.query_raw(&sql, dbargs![&realm.key, &realm.parent_key])
            .await?
            .try_for_each(|row| {
                let id = mapping.id.of::<Key>(&row);
                let item = RealmNavItem {
                    path: mapping.full_path.of(&row),
                    name: mapping.name.of(&row),
                };
                if Some(id) == realm.parent_key {
                    up = Some(item)
                } else {
                    list.push(item);
                }

                if id == realm.key {
                    show_self = false;
                }

                std::future::ready(Ok(()))
            })
            .await?;

        if realm.is_user_root() {
            up = Some(RealmNavItem {
                path: "".into(),
                name: None,
            });
        }

        Ok(Self {
            up,
            show_self,
            list_order: realm.child_order,
            list,
        })
    }
}

// #[derive(Debug, GraphQLObject)]
// pub(crate) struct RealmNavListItem {
//     /// Resolved name, like `Realm.name`.
//     name: Option<String>,
//     path: String,

// }
