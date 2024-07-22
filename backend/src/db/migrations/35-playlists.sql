select prepare_randomized_ids('playlist');


create type playlist_entry_type as enum ('event');

-- All fields should never be null.
create type playlist_entry as (
    -- The Opencast ID of this entry. Not a UUID.
    entry_id bigint,

    type playlist_entry_type,

    -- The Opencast ID of the referenced content.
    content_id text
);

create table playlists (
    id bigint primary key default randomized_id('playlist'),
    opencast_id text not null unique,

    title text not null,
    description text,
    creator text,

    entries playlist_entry[] not null,

    read_roles text[] not null,
    write_roles text[] not null,

    updated timestamp with time zone not null,

    constraint read_roles_no_null_value check (array_position(read_roles, null) is null),
    constraint write_roles_no_null_value check (array_position(write_roles, null) is null),
    constraint entries_no_null_value check (array_position(entries, null) is null)
);


-- To perform queries like `write_roles && $1` on the whole table. Probably just
-- to list all playlists that a user has write access to.
create index idx_playlists_write_roles on playlists using gin (write_roles);

-- Extend enum types to allow for playlist blocks, playlist items in search index queue
-- and to remember deleted playlists.
-- This needs to be done prior to their usage in the next migration since they can't be used
-- in the same migration they were added.
alter type block_type add value 'playlist';
alter type search_index_item_kind add value 'playlist';
alter type opencast_item_kind add value 'playlist';

