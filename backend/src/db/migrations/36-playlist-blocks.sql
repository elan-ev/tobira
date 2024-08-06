-- This adds the necessary type, column and constraints for playlist blocks.
alter table blocks
    add column playlist bigint references playlists on delete set null,
    add constraint playlist_block_has_fields check (type <> 'playlist' or (
        videolist_order is not null and
        videolist_layout is not null and
        show_title is not null and
        show_metadata is not null
    ));

alter type video_list_order add value 'original';

create index idx_block_playlist on blocks (playlist);


-- Add view for playlist data that we put into the search index.
create view search_playlists as
    select
        playlists.id, playlists.opencast_id,
        playlists.read_roles, playlists.write_roles,
        playlists.title, playlists.description, playlists.creator,
        coalesce(
            array_agg((
                -- Using a nested query here improves the overall performance
                -- for the main use case: 'where id = any(...)'. If we would
                -- use a join instead, the runtime would be the same with or
                -- without the 'where id' (roughly 300ms on my machine).
                select row(search_realms.*)::search_realms
                from search_realms
                where search_realms.id = blocks.realm
            )) filter(where blocks.realm is not null),
            '{}'
        ) as host_realms
    from playlists
    left join blocks on type = 'playlist' and blocks.playlist = playlists.id
    group by playlists.id;


-- Triggers to remember and reuse deleted playlists.
create trigger remember_deleted_opencast_playlists
after delete
on playlists
for each row
execute procedure remember_deleted_opencast_items('playlist');

create trigger reuse_existing_id_on_playlist_insert
before insert
on playlists
for each row
execute procedure reuse_existing_id_on_insert('playlist');

-- Everything related to queuing playlists for search indexing is done in the
-- next migration.
