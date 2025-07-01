use juniper::GraphQLObject;

use crate::{
    api::{err::ApiResult, Context},
    db::util::{dbargs, select},
    model::Key,
    prelude::*,
};

/// Information to render the navigation for a single realm.
#[derive(Debug, GraphQLObject)]
pub(crate) struct RealmNav {
    /// Elements above the list, usually current page and parent. Is either
    /// 0, 1 or 2 elements long. Order is "reversed" in that the last element
    /// is rendered first/topmost. The main root realm is treated as parent of
    /// user root realms.
    header: Vec<RealmNavItem>,

    /// Main part of the nav: list of realms to navigate to. These are usually
    /// the children of the current realm, except for non-root leaf nodes, where
    /// it's the siblings (including itself) instead.
    list: Vec<RealmNavItem>,

    /// Dictates in what order the items in `list` should be displayed.
    list_order: super::RealmOrder,
}

#[derive(Debug, GraphQLObject)]
pub(crate) struct RealmNavItem {
    /// Resolved name, like `Realm.name`.
    name: Option<String>,
    path: String,
    has_children: bool,
}

impl RealmNav {
    pub(crate) async fn load_for(realm: &super::Realm, context: &Context) -> ApiResult<Self> {
        let (selection, mapping) = select!(
            id,
            full_path,
            child_order,
            // This causes an "index only scan" for each row, but this is extremely fast.
            has_children: "exists(select from realms r2 where r2.parent = realms.id)",
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

        let list_filter = if realm.is_main_root() || realm.is_user_root() {
            "parent = $1"
        } else {
            "case
                -- If realm has children -> select children
                when $2 is null or exists(select from realms where parent = $1) then parent = $1
                -- If not -> select siblings
                else parent = $2
            end"
        };
        let sql = format!("\
            select {selection} from realms where
                -- grandparent
                full_path = $3
                -- parent
                or id = $2
                -- list
                or {list_filter}
            order by index asc");

        let grandparent_path = realm.full_path.rsplitn(3, '/').nth(2);
        let parent_key = if realm.is_user_root() { Some(Key(0)) } else { realm.parent_key };
        let rows = context.db.query_raw(&sql, dbargs![
            &realm.key,
            &parent_key,
            &grandparent_path,
        ]).await?;

        // Go through rows and collect all parts.
        let mut parent = None;
        let mut parent_order = None;
        let mut grandparent = None;
        let mut list = vec![];
        rows.try_for_each(|row| {
            let id = mapping.id.of::<Key>(&row);
            let item = RealmNavItem {
                path: mapping.full_path.of(&row),
                name: mapping.name.of(&row),
                has_children: mapping.has_children.of(&row),
            };

            if parent_key == Some(id) {
                parent_order = Some(mapping.child_order.of(&row));
                parent = Some(item);
            } else if grandparent_path == Some(&item.path) {
                grandparent = Some(item);
            } else {
                list.push(item);
            }

            std::future::ready(Ok(()))
        }).await?;

        // Check if the `list` contains children or siblings of `realm`.
        if list.len() > 0 && list[0].path.split('/').count() == realm.full_path.split('/').count() {
            // Siblings
            Ok(Self {
                header: [grandparent, parent].into_iter().flatten().collect(),
                list,
                list_order: parent_order.expect("no parent of siblings"),
            })
        } else {
            // Children
            let this = RealmNavItem {
                name: realm.resolved_name.clone(),
                path: realm.full_path.clone(),
                has_children: true,
            };

            // Special case main root where we don't show "this".
            let this = if realm.is_main_root() { None } else { Some(this) };

            Ok(Self {
                header: [parent, this].into_iter().flatten().collect(),
                list,
                list_order: realm.child_order,
            })
        }
    }
}
