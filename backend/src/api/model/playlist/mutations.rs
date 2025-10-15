use hyper::StatusCode;

use crate::{
    api::{
        err::{self, ApiResult},
        model::{
            acl::AclInputEntry,
            event::AuthorizedEvent,
            shared::{convert_acl_input, BasicMetadata},
        },
        Context,
        Id,
    },
    prelude::*,
    sync::client::{AclInput, OpencastItem},
};

use super::{Playlist, AuthorizedPlaylist};



impl AuthorizedPlaylist {
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

        let entry_ids = if let Some(entries) = entries {
            let mut entry_ids = Vec::with_capacity(entries.len());
            for id in entries {
                let maybe_event = AuthorizedEvent::load_by_id(id, context).await?;
                let event = maybe_event.ok_or_else(|| err::invalid_input!(
                    key = "event.not-found",
                    "unknown event"
                ))?;
                let event = event.into_result()?;
                entry_ids.push(event.opencast_id);
            }
            Some(entry_ids)
        } else {
            None
        };

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
