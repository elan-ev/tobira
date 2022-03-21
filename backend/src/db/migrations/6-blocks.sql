-- This table stores content blocks of realms.
--
-- Unfortunately, having different kinds of content blocks doesn't map
-- particularly well to a relational database. Since we don't expect to have a
-- lot of different kinds, we decided to represent all in a single table where
-- columns that are unused by one type of content block are simply `null`.

select prepare_randomized_ids('block');

create type block_type as enum ('title', 'text', 'series', 'video');
create type video_list_layout as enum ('horizontal', 'vertical', 'grid');
create type video_list_order as enum ('new_to_old', 'old_to_new');

create table blocks (
    -- Shared properties
    id bigint primary key default randomized_id('block'),
    realm_id bigint not null references realms on delete cascade,
    type block_type not null,
    index smallint not null,

    -- Title and text blocks
    text_content text,

    -- Series blocks
    series_id bigint references series on delete set null,

    -- All videolist-like blocks
    videolist_layout video_list_layout,
    videolist_order video_list_order,

    -- Video blocks
    video_id bigint references events on delete set null,

    -- Blocks with a "natural title"
    show_title boolean default true,


    -- Enforce several constraints
    constraint index_unique_in_realm unique(realm_id, index) deferrable initially immediate,
    constraint index_positive check (index >= 0),

    constraint title_block_has_fields check (type <> 'title' or (
        text_content is not null
    )),
    constraint text_block_has_fields check (type <> 'text' or (
        text_content is not null
    )),
    constraint series_block_has_fields check (type <> 'series' or (
        videolist_layout is not null and
        videolist_order is not null and
        show_title is not null
    )),
    constraint video_block_has_fields check (type <> 'video' or (
        show_title is not null
    ))
);

-- Blocks are almost always looked up by realm ID.
create index idx_block_realm_id on blocks (realm_id);
