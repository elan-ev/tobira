-- All types of items that can cause the need for reindexing.
create type search_index_item_kind as enum ('realm', 'event');


-- This table is used to push records that need to updated in the search index.
create table search_index_queue (
    -- Auto-incrementing integer to sort by (for queue semantics).
    id bigint primary key generated always as identity,

    -- The ID of the realm, event, ... $type.
    item_id bigint not null,

    -- The type of the item referenced here
    kind search_index_item_kind not null,


    -- Every item should be in the queue only once.
    constraint id_type_unique unique(item_id, kind)
);
