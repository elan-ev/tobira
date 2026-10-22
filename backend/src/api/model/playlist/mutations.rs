use std::collections::HashMap;

use hyper::StatusCode;

use crate::{
    api::{
        err::{self, ApiResult, ApiError, ApiErrorKind},
        model::{
            shared::{ensure_acl_assignment_allowed, BasicMetadata, ensure_only_read_write_actions},
        },
        Context,
        Id,
    },
    model::{AclForDb, AclItem, Key, OpencastId, PlaylistEntryId},
    prelude::*,
    sync::client::{AclInput, OpencastItem},
};

use super::{Playlist, AuthorizedPlaylist};


#[derive(juniper::GraphQLInputObject)]
pub(crate) struct PlaylistEntrySlot {
    /// Used to identify existing playlist entries, regardless of visibility
   /// (i.e. it's also on placeholders in frontend)
    pub(crate) entry_id: Option<PlaylistEntryId>,
    /// Newly added events do not have an entry ID before the playlist is saved in Opencast,
    /// so we use the Tobira ID to load them.
    pub(crate) new_event_id: Option<Id>,
}



impl AuthorizedPlaylist {
    pub(crate) async fn create(
        metadata: BasicMetadata,
        creator: String,
        entries: Vec<Id>,
        acl: Vec<AclItem>,
        context: &Context,
    ) -> ApiResult<Self> {
        if !context.auth.can_create_playlists(&context.config.auth) {
            return Err(err::not_authorized!(key = "playlist.not-allowed", "playlist action not allowed"));
        }
        ensure_only_read_write_actions(&acl)?;
        ensure_acl_assignment_allowed(context, &acl, None).await?;

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

        let acl = AclForDb::from_items(&acl);
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
        entries: Option<Vec<PlaylistEntrySlot>>,
        acl: Option<Vec<AclItem>>,
        context: &Context,
    ) -> ApiResult<Self> {
        // `load_for_mutation` handles authorization.
        let playlist = Playlist::load_for_mutation(id, context).await?;

        if let Some(acl) = &acl {
            ensure_only_read_write_actions(&acl)?;
            ensure_acl_assignment_allowed(context, acl, Some(&playlist.acl)).await?;
        }

        // If a new (i.e. edited) entry list is provided, we need to know the Opencast ID of each.
        // Entries already in the playlist are referred to by entry ID and resolved against this
        // playlist's own current entries; newly added events are referred to by Tobira ID and
        // resolved via the `events` table.
        let entry_ids = if let Some(entries) = entries {
            let existing_entry_ids: Vec<_> = entries.iter().filter_map(|e| e.entry_id).collect();
            let content_id_by_entry_id = load_entries_by_entry_id(
                playlist.key,
                &existing_entry_ids,
                context,
            ).await?;

            let new_event_ids = entries.iter().filter_map(|e| e.new_event_id).collect();
            let resolved_new = load_entries(new_event_ids, context).await?;
            let mut resolved_new_iter = resolved_new.into_iter();

            let ids: Result<Vec<_>, _> = entries.into_iter()
                .map(|slot| {
                    match (slot.entry_id, slot.new_event_id) {
                        (Some(_), Some(_)) => Err(err::invalid_input!(
                            "PlaylistEntrySlot must not have both `entryId` and `newEventId`"
                        )),
                        (Some(entry_id), None) => Ok(content_id_by_entry_id[&entry_id].clone()),
                        (None, Some(_)) => Ok(resolved_new_iter.next().expect("resolved count mismatch")),
                        (None, None) => Err(err::invalid_input!(
                            "PlaylistEntrySlot must have either `entryId` or `newEventId`"
                        )),
                    }
                })
                .collect();

            Some(ids?)
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
        let acl_entries: Vec<AclItem> = response.acl
            .into_iter()
            .filter(|a| a.allow)
            .map(|a| AclItem { role: a.role, actions: vec![a.action] })
            .collect();
        let response_acl = AclForDb::from_items(&acl_entries);

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
            info!(
                playlist_id = %id,
                opencast_id = %playlist.opencast_id,
                "Deleted playlist",
            );
            context.db.execute("delete from playlists where id = $1", &[&playlist.key]).await?;
            Ok(RemovedPlaylist { id: playlist.id() })
        } else {
            warn!(
                playlist_id = %id,
                opencast_id = %playlist.opencast_id,
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

    // `unnest` with ordinality preserves input order.
    let entry_ids = context.db
        .query_mapped(
            "select e.opencast_id \
                from unnest($1::bigint[]) with ordinality as t(id, ord) \
                join events e on e.id = t.id \
                order by t.ord",
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

/// Resolves given entry IDs to their Opencast ID.
async fn load_entries_by_entry_id(
    playlist_key: Key,
    entry_ids: &[PlaylistEntryId],
    context: &Context,
) -> ApiResult<HashMap<PlaylistEntryId, OpencastId>> {
    let map: HashMap<PlaylistEntryId, _> = context.db
        .query_mapped(
            "select t.entry_id, t.content_id \
                from playlists, lateral unnest(playlists.entries) as t \
                where playlists.id = $1 and t.entry_id = any($2::bigint[])",
            dbargs![&playlist_key, &entry_ids],
            |row| (row.get(0), OpencastId(row.get(1))),
        )
        .await?
        .into_iter()
        .collect();

    if let Some(&missing) = entry_ids.iter().find(|id| !map.contains_key(id)) {
        return Err(err::invalid_input!(
            "PlaylistEntrySlot refers to unknown entry ID {missing} in this playlist"
        ));
    }

    Ok(map)
}
