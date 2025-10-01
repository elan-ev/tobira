use juniper::graphql_object;
use postgres_types::ToSql;

use crate::{
    api::{
        common::NotAllowed,
        err::{self, ApiResult},
        model::{
            acl::AclInputEntry,
            shared::{convert_acl_input, BasicMetadata},
        },
        Context,
        Id,
        Node,
        NodeValue,
    },
    db::util::{impl_from_db, select},
    model::Key,
    prelude::*,
};

use super::event::AuthorizedEvent;


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

    read_roles: Vec<String>,
    #[allow(dead_code)] // TODO
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
        playlists.{ id, opencast_id, title, description, creator, read_roles, write_roles },
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

    pub(crate) async fn create(
        metadata: BasicMetadata,
        creator: String,
        entries: Vec<String>,
        acl: Vec<AclInputEntry>,
        context: &Context,
    ) -> ApiResult<Self> {
        if !context.auth.can_create_playlists(&context.config.auth) {
            return Err(err::not_authorized!(key = "playlist.not-allowed", "playlist action not allowed"));
        }

        let response = context
            .oc_client
            .create_playlist(
                &metadata.title,
                metadata.description.as_deref(),
                &creator,
                &entries,
                &acl,
            ).await
            .map_err(|e| {
                error!("Failed to create playlist in Opencast: {}", e);
                err::opencast_unavailable!("Failed to create playlist")
            })?;

        let acl = convert_acl_input(acl);
        let selection = Self::select();

        let query = format!(
            "insert into playlists ( \
                opencast_id, title, description, creator, \
                entries, read_roles, write_roles, updated \
            ) \
            values ($1, $2, $3, $4, $5, $6, $7, now()) \
            returning {selection}",
        );

        context.db
            .query_one(&query, &[
                &response.id,
                &metadata.title,
                &metadata.description,
                &creator,
                &response.entries,
                &acl.read_roles,
                &acl.write_roles,
            ]).await?
            .pipe(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }
}

impl Node for AuthorizedPlaylist {
    fn id(&self) -> Id {
        Id::playlist(self.key)
    }
}
