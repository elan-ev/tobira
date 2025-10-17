use chrono::{DateTime, Utc};
use juniper::{graphql_object, GraphQLEnum, GraphQLInputObject};
use postgres_types::ToSql;

use crate::{
    api::{
        common::NotAllowed,
        err::{self, ApiResult},
        model::{
            acl::{self, Acl},
            realm::Realm,
            shared::{
                define_sort_column_and_order,
                load_writable_for_user,
                Connection,
                ConnectionQueryParts,
                PageInfo,
                SearchFilter,
                SortDirection,
                SortOrder,
                ToSqlColumn,
            },
        },
        util::LazyLoad,
        Context,
        Id,
        Node,
        NodeValue,
    },
    db::util::{impl_from_db, select},
    model::{Key, SearchThumbnailInfo, ThumbnailInfo, ThumbnailStack},
    prelude::*,
};

use super::event::AuthorizedEvent;

mod mutations;

pub(crate) use mutations::RemovedPlaylist;


#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum Playlist {
    Playlist(AuthorizedPlaylist),
    NotAllowed(NotAllowed),
}

pub(crate) struct AuthorizedPlaylist {
    pub(crate) key: Key,
    opencast_id: String,
    title: String,
    description: Option<String>,
    creator: String,
    updated: DateTime<Utc>,
    num_entries: LazyLoad<u32>,
    thumbnail_stack: LazyLoad<ThumbnailStack>,

    read_roles: Vec<String>,
    write_roles: Vec<String>,
}


#[derive(juniper::GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum VideoListEntry {
    Event(AuthorizedEvent),
    NotAllowed(NotAllowed),
    Missing(Missing),
}

/// The data referred to by a playlist entry was not found.
pub(crate) struct Missing;
crate::api::util::impl_object_with_dummy_field!(Missing);


impl_from_db!(
    AuthorizedPlaylist,
    select: {
        playlists.{
            id, opencast_id, title, description,
            creator, read_roles, write_roles, updated,
        },
    },
    |row| {
        Self {
            key: row.id(),
            opencast_id: row.opencast_id(),
            title: row.title(),
            description: row.description(),
            creator: row.creator(),
            read_roles: row.read_roles(),
            write_roles: row.write_roles(),
            updated: row.updated(),
            num_entries: LazyLoad::NotLoaded,
            thumbnail_stack: LazyLoad::NotLoaded,
        }
    },
);

impl Playlist {
    pub(crate) async fn load_by_id(id: Id, context: &Context) -> ApiResult<Option<Self>> {
        if let Some(key) = id.key_for(Id::PLAYLIST_KIND) {
            Self::load_by_key(key, context).await
        } else {
            Ok(None)
        }
    }

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> ApiResult<Option<Self>> {
        Self::load_by_any_id("id", &key, context).await
    }

    pub(crate) async fn load_by_opencast_id(id: String, context: &Context) -> ApiResult<Option<Self>> {
        Self::load_by_any_id("opencast_id", &id, context).await
    }

    async fn load_by_any_id(
        col: &str,
        id: &(dyn ToSql + Sync),
        context: &Context,
    ) -> ApiResult<Option<Self>> {
        let selection = AuthorizedPlaylist::select();
        let query = format!("select {selection} from playlists where {col} = $1");
        context.db
            .query_opt(&query, &[id])
            .await?
            .map(|row| {
                let playlist = AuthorizedPlaylist::from_row_start(&row);
                if context.auth.overlaps_roles(&playlist.read_roles) {
                    Playlist::Playlist(playlist)
                } else {
                    Playlist::NotAllowed(NotAllowed)
                }
            })
            .pipe(Ok)
    }

    async fn load_for_mutation(id: Id, context: &Context) -> ApiResult<AuthorizedPlaylist> {
        let playlist = Playlist::load_by_id(id, context)
            .await?
            .ok_or_else(|| err::invalid_input!(key = "playlist.not-found", "playlist not found"))?
            .into_result()?;

        if !context.auth.overlaps_roles(&playlist.write_roles) {
            return Err(err::not_authorized!(key = "playlist.not-allowed", "playlist action not allowed"));
        }

        Ok(playlist)
    }

    pub(crate) async fn load_writable_for_user(
        context: &Context,
        order: SortOrder<PlaylistsSortColumn>,
        offset: i32,
        limit: i32,
        filter: Option<SearchFilter>,
    ) -> ApiResult<Connection<AuthorizedPlaylist>> {
        let parts = ConnectionQueryParts {
            table: "playlists",
            alias: None,
            join_clause: "",
        };
        let (selection, mapping) = select!(
            playlist: AuthorizedPlaylist,
            num_entries: "cardinality(playlists.entries)",
            thumbnails: "array(\
                select search_thumbnail_info_for_event(events.*) \
                from events \
                where events.opencast_id = any( \
                    array( \
                        select (playlist_entry).content_id \
                        from unnest(playlists.entries) playlist_entry \
                    ) \
                ) \
            )",
        );
        load_writable_for_user(context, order, filter, offset, limit, parts, selection, |row| {
            let mut out = AuthorizedPlaylist::from_row(row, mapping.playlist);
            out.num_entries = LazyLoad::Loaded(mapping.num_entries.of::<i32>(row) as u32);
            out.thumbnail_stack = LazyLoad::Loaded(ThumbnailStack {
                thumbnails: mapping.thumbnails.of::<Vec<SearchThumbnailInfo>>(row)
                    .into_iter()
                    .filter_map(|info| ThumbnailInfo::from_search(info, &context))
                    .collect(),
            });
            out
        }).await
    }

    pub(crate) fn into_result(self) -> ApiResult<AuthorizedPlaylist> {
        match self {
            Self::Playlist(p) => Ok(p),
            Self::NotAllowed(_) => Err(err::not_authorized!(
                key = "view.playlist",
                "you cannot access this playlist",
            )),
        }
    }
}

/// Represents an Opencast playlist.
#[graphql_object(Context = Context, impl = NodeValue)]
impl AuthorizedPlaylist {
    fn id(&self) -> Id {
        Node::id(self)
    }

    fn opencast_id(&self) -> &str {
        &self.opencast_id
    }

    fn title(&self) -> &str {
        &self.title
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    fn creator(&self) -> &str {
        &self.creator
    }

    fn updated(&self) -> DateTime<Utc> {
        self.updated
    }

    /// Returns the number of entries in this playlist. Note: this is lazily loaded
    /// and only available in certain contexts (e.g., playlist listings).
    fn num_entries(&self) -> i32 {
        self.num_entries.unwrap() as i32
    }

    fn thumbnail_stack(&self) -> &ThumbnailStack {
        self.thumbnail_stack.as_ref().unwrap()
    }

    async fn acl(&self, context: &Context) -> ApiResult<Acl> {
        let raw_roles_sql = "\
            select unnest(read_roles) as role, 'read' as action from playlists where id = $1
            union
            select unnest(write_roles) as role, 'write' as action from playlists where id = $1
        ";
        acl::load_for(context, raw_roles_sql, dbargs![&self.key]).await
    }

    async fn entries(&self, context: &Context) -> ApiResult<Vec<VideoListEntry>> {
        let (selection, mapping) = select!(
            found: "events.id is not null",
            event: AuthorizedEvent,
        );
        let query = format!("\
            with entries as (\
                select unnest(entries) as entry \
                from playlists \
                where id = $1\
            ),
            event_ids as (\
                select (entry).content_id as id \
                from entries \
                where (entry).type = 'event'\
            )
            select {selection} from event_ids \
            left join events on events.opencast_id = event_ids.id \
            left join series on series.id = events.series\
        ");
        context.db
            .query_mapped(&query, dbargs![&self.key], |row| {
                if !mapping.found.of::<bool>(&row) {
                    return VideoListEntry::Missing(Missing);
                }

                let event = AuthorizedEvent::from_row(&row, mapping.event);
                if !context.auth.overlaps_roles(&event.read_roles) {
                    return VideoListEntry::NotAllowed(NotAllowed);
                }

                VideoListEntry::Event(event)
            })
            .await?
            .pipe(Ok)
    }

    async fn host_realms(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        let selection = Realm::select();
        let query = format!("\
            select {selection} \
            from realms \
            where exists ( \
                select from blocks \
                where realm = realms.id \
                and type = 'playlist' \
                and playlist = $1 \
            ) \
        ");
        let id = self.id().key_for(Id::PLAYLIST_KIND).unwrap();
        context.db.query_mapped(&query, dbargs![&id], |row| Realm::from_row_start(&row))
            .await?
            .pipe(Ok)
    }


    /// Whether the current user has write access to this playlist.
    fn can_write(&self, context: &Context) -> bool {
        context.auth.overlaps_roles(&self.write_roles)
    }
}

impl Node for AuthorizedPlaylist {
    fn id(&self) -> Id {
        Id::playlist(self.key)
    }
}

#[graphql_object(name = "PlaylistConnection", context = Context)]
impl Connection<AuthorizedPlaylist> {
    fn page_info(&self) -> &PageInfo {
        &self.page_info
    }
    fn items(&self) -> &[AuthorizedPlaylist] {
        &self.items
    }
    fn total_count(&self) -> i32 {
        self.total_count
    }
}

define_sort_column_and_order!(
    pub enum PlaylistsSortColumn {
        Title      => "title",
        #[default]
        Updated    => "updated",
        EventCount => "cardinality(playlists.entries)",
    };
    pub struct PlaylistsSortOrder
);

