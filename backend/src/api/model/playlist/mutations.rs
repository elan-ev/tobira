use hyper::StatusCode;

use crate::{
    api::{
        err::{self, ApiResult, ApiError, ApiErrorKind},
        model::{
            acl::AclInputEntry,
            shared::{convert_acl_input, BasicMetadata},
        },
        Context,
        Id,
    },
    model::OpencastId,
    prelude::*,
    sync::client::{AclInput, OpencastItem},
};

use super::{Playlist, AuthorizedPlaylist};



impl AuthorizedPlaylist {
    pub(crate) async fn create(
        metadata: BasicMetadata,
        creator: String,
        entries: Vec<Id>,
        acl: Vec<AclInputEntry>,
        context: &Context,
    ) -> ApiResult<Self> {
        if !context.auth.can_create_playlists(&context.config.auth) {
            return Err(err::not_authorized!(key = "playlist.not-allowed", "playlist action not allowed"));
        }

        let entry_ids = load_entries(entries, context).await?;

        let response = context
            .oc_client
            .create_playlist(
                &metadata.title,
                metadata.description.as_deref(),
                &creator,
                &entry_ids,
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

    pub(crate) async fn update(
        id: Id,
        title: Option<String>,
        description: Option<String>,
        entries: Option<Vec<Id>>,
        acl: Option<Vec<AclInputEntry>>,
        context: &Context,
    ) -> ApiResult<Self> {
        // `load_for_mutation` handles authorization.
        let playlist = Playlist::load_for_mutation(id, context).await?;

        let mut entry_ids = if let Some(entries) = entries {
            Some(load_entries(entries, context).await?)
        } else {
            None
        };

        // If a new explicit entry list is provided, we need to make sure to preserve any existing
        // entries that are not known to Tobira.
        // Otherwise an update would accidentally drop those entries from the playlist in Opencast.
        if let Some(ids) = &mut entry_ids {
            let query = "\
                with entries as (\
                    select unnest(entries) as entry \
                    from playlists \
                    where id = $1\
                ) \
                select (entry).content_id as id \
                from entries \
                left join events on events.opencast_id = (entry).content_id \
                where (entry).type = 'event' and events.id is null\
            ";

            let unknown_ids = context.db
                .query_mapped(query, dbargs![&playlist.key], |row| row.get(0))
                .await?;

            // This does not preserve the original order, but unknown (i.e. waiting) events in playlists will be a very rare
            // occurrence. Currently, those can only be added via API.
            ids.extend(unknown_ids);
        }

        let response = context
            .oc_client
            .update_playlist(
                playlist.opencast_id,
                title.as_deref(),
                description.as_deref(),
                entry_ids.as_deref(),
                acl.as_deref(),
            ).await
            .map_err(|e| {
                error!("Failed to update playlist in Opencast: {}", e);
                err::opencast_unavailable!("Failed to update playlist")
            })?;

        // We need to convert the response's ACL back to our DB format.
        // Filtering for `allow` is probably not necessary (I don't think that can be `false`)
        // but it doesn't hurt to stay on the safe side.
        let acl_entries: Vec<AclInputEntry> = response.acl
            .into_iter()
            .filter(|a| a.allow)
            .map(|a| AclInputEntry { role: a.role, actions: vec![a.action] })
            .collect();
        let response_acl = convert_acl_input(acl_entries);

        let selection = Self::select();
        let query = format!(
            "update playlists set \
                title = $2, description = $3, creator = $4, entries = $5, \
                read_roles = $6, write_roles = $7, updated = now() \
            where id = $1 \
            returning {selection}",
        );
        context.db
            .query_one(&query, &[
                &playlist.key,
                &response.title,
                &response.description,
                &response.creator,
                &response.entries,
                &response_acl.read_roles,
                &response_acl.write_roles,
            ]).await?
            .pipe(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }

    pub(crate) async fn delete(id: Id, context: &Context) -> ApiResult<RemovedPlaylist> {
        let playlist = Playlist::load_for_mutation(id, context).await?;

        let response = context
            .oc_client
            .delete(&playlist)
            .await
            .map_err(|e| {
                error!("Failed to send delete request: {}", e);
                err::opencast_unavailable!("Failed to communicate with Opencast")
            })?;

        if response.status() == StatusCode::OK {
            // 200: OK, Playlist removed.
            info!(playlist_id = %id, "Deleted playlist");
            context.db.execute("delete from playlists where id = $1", &[&playlist.key]).await?;
            Ok(RemovedPlaylist { id: playlist.id() })
        } else {
            warn!(
                playlist_id = %id,
                "Failed to delete playlist, OC returned status: {}",
                response.status()
            );
            Err(err::opencast_unavailable!("Opencast API error: {}", response.status()))
        }
    }
}

impl OpencastItem for AuthorizedPlaylist {
    fn endpoint_path(&self) -> &'static str {
        "playlists"
    }

    fn id(&self) -> &str {
        &self.opencast_id
    }

    fn metadata_flavor(&self) -> &'static str {
        unreachable!()
    }

    async fn extra_roles(&self, _context: &Context, _oc_id: &str) -> Result<Vec<AclInput>> {
       // Playlists do not have custom or preview roles.
        Ok(vec![])
    }
}

#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct RemovedPlaylist {
    id: Id,
}

async fn load_entries(entries: Vec<Id>, context: &Context) -> ApiResult<Vec<OpencastId>> {
    let entry_keys: Vec<_> = entries.iter().map(|id| id.key_for(Id::EVENT_KIND)).collect();
    let entry_ids = context.db
        .query_mapped(
            "select opencast_id from events where id = any($1)",
            dbargs![&entry_keys],
            |row| row.get(0),
        )
        .await?;

    if entry_ids.len() != entries.len() {
        return Err(ApiError {
            msg: "Attempted to add unknown entries".into(),
            kind: ApiErrorKind::InvalidInput,
            key: Some("playlist.entry-not-found"),
        });
    }

    Ok(entry_ids)
}
