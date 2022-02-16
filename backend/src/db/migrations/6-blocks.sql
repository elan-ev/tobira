-- This table stores content blocks of realms.
--
-- Unfortunately, having different kinds of content blocks doesn't map
-- particularly well to a relational database. Since we don't expect to have a
-- lot of different kinds, we decided to represent all in a single table where
-- columns that are unused by one type of content block are simply `null`.

select prepare_randomized_ids('block');

create type block_type as enum ('text', 'series', 'video');
create type video_list_layout as enum ('horizontal', 'vertical', 'grid');
create type video_list_order as enum ('new_to_old', 'old_to_new');

create table blocks (
    -- Shared properties
    id bigint primary key default randomized_id('block'),
    realm_id bigint not null references realms on delete cascade,
    type block_type not null,
    index smallint not null,
    title text,

    -- Text blocks
    text_content text,

    -- Series blocks
    series_id bigint references series on delete set null,

    -- All videolist-like blocks
    videolist_layout video_list_layout,
    videolist_order video_list_order,

    -- Video blocks
    video_id bigint references events on delete set null
);

-- Blocks are almost always looked up by realm ID.
create index idx_block_realm_id on blocks (realm_id);
