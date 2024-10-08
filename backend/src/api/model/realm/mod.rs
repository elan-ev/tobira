use juniper::{graphql_object, GraphQLEnum, GraphQLObject, GraphQLUnion, graphql_interface};
use postgres_types::{FromSql, ToSql};

use crate::{
    api::{
        Context,
        err::ApiResult,
        Id,
        model::acl::{self, Acl},
        Node,
        NodeValue,
    },
    auth::AuthContext,
    db::{types::Key, util::{impl_from_db, select}},
    prelude::*,
};
use super::block::{Block, BlockValue, PlaylistBlock, SeriesBlock, VideoBlock};


mod mutations;

pub(crate) use mutations::{
    ChildIndex, NewRealm, RemovedRealm, UpdateRealm, UpdatedPermissions,
    UpdatedRealmName, RealmSpecifier, RealmLineageComponent, CreateRealmLineageOutcome,
    RemoveMountedSeriesOutcome,
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
            BlockValue::PlaylistBlock(b) => Ok(RealmNameSourceBlockValue::PlaylistBlock(b)),
            _ => unreachable!("block {:?} has invalid type for name source", self.block),
        }
    }
}

#[graphql_interface(Context = Context, for = [SeriesBlock, VideoBlock, PlaylistBlock])]
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

impl RealmNameSourceBlock for PlaylistBlock {
    fn id(&self) -> Id {
        self.shared.id
    }
}

impl Block for RealmNameSourceBlockValue {
    fn shared(&self) -> &super::block::SharedData {
        match self {
            Self::SeriesBlock(b) => b.shared(),
            Self::VideoBlock(b) => b.shared(),
            Self::PlaylistBlock(b) => b.shared(),
        }
    }
}


pub(crate) struct Realm {
    pub(crate) key: Key,
    pub(crate) parent_key: Option<Key>,
    pub(crate) plain_name: Option<String>,
    pub(crate) resolved_name: Option<String>,
    pub(crate) name_from_block: Option<Key>,
    pub(crate) path_segment: String,
    pub(crate) full_path: String,
    pub(crate) index: i32,
    pub(crate) child_order: RealmOrder,
    pub(crate) owner_display_name: Option<String>,
    pub(crate) moderator_roles: Vec<String>,
    pub(crate) admin_roles: Vec<String>,
    pub(crate) flattened_moderator_roles: Vec<String>,
    pub(crate) flattened_admin_roles: Vec<String>,
}

impl_from_db!(
    Realm,
    select: {
        realms.{
            id, parent, name, name_from_block, path_segment, full_path, index,
            child_order, resolved_name, owner_display_name, moderator_roles,
            admin_roles, flattened_moderator_roles, flattened_admin_roles,
        },
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
            owner_display_name: row.owner_display_name(),
            moderator_roles: row.moderator_roles(),
            admin_roles: row.admin_roles(),
            flattened_moderator_roles: row.flattened_moderator_roles(),
            flattened_admin_roles: row.flattened_admin_roles(),
        }
    }
);

impl Realm {
    pub(crate) async fn root(context: &Context) -> ApiResult<Self> {
        let (selection, mapping) = select!(child_order, moderator_roles, admin_roles);
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
            owner_display_name: None,
            moderator_roles: mapping.moderator_roles.of(&row),
            admin_roles: mapping.admin_roles.of(&row),
            flattened_moderator_roles: mapping.moderator_roles.of(&row),
            flattened_admin_roles: mapping.admin_roles.of(&row),
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
        let query = format!("select {selection} from realms where realms.id = $1");
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

        let selection = Self::select();
        let query = format!("select {selection} from realms where realms.full_path = $1");
        context.db
            .query_opt(&query, &[&path])
            .await?
            .map(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }

    pub(crate) fn is_main_root(&self) -> bool {
        self.key.0 == 0
    }

    pub(crate) fn is_user_realm(&self) -> bool {
        self.full_path.starts_with("/@")
    }

    pub(crate) fn is_user_root(&self) -> bool {
        self.is_user_realm() && self.parent_key.is_none()
    }

    /// Returns all immediate children of this realm. The children are always
    /// ordered by the internal index. If `childOrder` returns an ordering
    /// different from `BY_INDEX`, the frontend is supposed to sort the
    /// children.
    pub(crate) async fn children(&self, context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!(
            "select {selection} \
                from realms \
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

    /// Returns the username of the user owning this realm tree IF it is a user
    /// realm. Otherwise returns `None`.
    pub(crate) fn owning_user(&self) -> Option<&str> {
        self.full_path.strip_prefix("/@")?.split('/').next()
    }

    /// Returns whether the current user is the owner of this realm.
    fn is_current_user_owner(&self, context: &Context) -> bool {
        self.owning_user().is_some_and(|owning_user| {
            matches!(&context.auth, AuthContext::User(u) if u.username == owning_user)
        })
    }

    fn is_current_user_page_admin(&self, context: &Context) -> bool {
        context.auth.is_global_page_admin(&context.config.auth)
            || self.is_current_user_owner(context)
            || context.auth.overlaps_roles(&self.flattened_admin_roles)
    }

    fn can_current_user_moderate(&self, context: &Context) -> bool {
        context.auth.is_global_page_moderator(&context.config.auth)
            || self.is_current_user_owner(context)
            || context.auth.overlaps_roles(&self.flattened_moderator_roles)
    }

    pub(crate) fn require_moderator_rights(&self, context: &Context) -> ApiResult<()> {
        if !self.can_current_user_moderate(context) {
            return Err(context.access_error("realm.no-moderator-rights", |user| format!(
                "moderator rights for page '{}' required, but '{user}' is ineligible",
                self.full_path,
            )))
        }

        Ok(())
    }

    pub(crate) fn require_admin_rights(&self, context: &Context) -> ApiResult<()> {
        if !self.is_current_user_page_admin(context) {
            return Err(context.access_error("realm.no-page-admin-rights", |user| format!(
                "page admin rights for page '{}' required, but '{user}' is ineligible",
                self.full_path,
            )))
        }

        Ok(())
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

    /// Returns `true` if this is the root of the public realm tree (with path = "/").
    fn is_main_root(&self) -> bool {
        self.is_main_root()
    }

    /// Returns true if this is the root of a user realm tree.
    fn is_user_root(&self) -> bool {
        self.is_user_root()
    }

    /// Returns `true` if this realm is managed by a user (path starting with `/@`).
    fn is_user_realm(&self) -> bool {
        self.is_user_realm()
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
    /// Empty for the main root realm.
    fn path_segment(&self) -> &str {
        &self.path_segment
    }

    /// Returns the full path of this realm. `"/"` for the main root realm.
    /// Otherwise it never has a trailing `/`. For user realms, starts with
    /// `/@`.
    fn path(&self) -> &str {
        if self.key.0 == 0 { "/" } else { &self.full_path }
    }

    /// This only returns a value for root user realms, in which case it is
    /// the display name of the user who owns this realm. For all other realms,
    /// `null` is returned.
    fn owner_display_name(&self) -> Option<&str> {
        self.owner_display_name.as_deref()
    }

    /// Returns the acl of this realm, combining moderator and admin roles and assigns 
    /// the respective actions that are necessary for UI purposes.
    async fn own_acl(&self, context: &Context) -> ApiResult<Acl> {
        let raw_roles_sql = "
            select unnest(moderator_roles) as role, 'moderate' as action from realms where id = $1
            union
            select unnest(admin_roles) as role, 'admin' as action from realms where id = $1
        ";
        acl::load_for(context, raw_roles_sql, dbargs![&self.key]).await
    }

    /// Returns the combined acl of this realm's parent, which effectively contains
    /// the acl and inherited acl of each ancestor realm. This is used to display
    /// these roles in the permissions UI, where we don't want to show that realm's own
    /// flattened acl since that also contains the realm's "regular", i.e. non-inherited
    /// acl.
    async fn inherited_acl(&self, context: &Context) -> ApiResult<Acl> {
        let raw_roles_sql = "
            select unnest(flattened_moderator_roles) as role, 'moderate' as action from realms where id = $1
            union
            select unnest(flattened_admin_roles) as role, 'admin' as action from realms where id = $1
        ";
        acl::load_for(context, raw_roles_sql, dbargs![&self.parent_key]).await
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
        self.children(context).await
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

    /// Returns whether the current user has the rights to add sub-pages, edit realm content,
    /// and edit settings including changing the realm path, deleting the realm and editing
    /// the realm's acl.
    fn is_current_user_page_admin(&self, context: &Context) -> bool {
        self.is_current_user_page_admin(context)
    }

    /// Returns whether the current user has the rights to add sub-pages and edit realm content
    /// and non-critical settings.
    fn can_current_user_moderate(&self, context: &Context) -> bool {
        self.can_current_user_moderate(context)
    }
}
