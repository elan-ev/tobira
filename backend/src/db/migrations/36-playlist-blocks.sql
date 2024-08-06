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

-- Everything related to playlists in the search index is done in the
-- next migration.
