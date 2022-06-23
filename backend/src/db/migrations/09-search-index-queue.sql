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


-- Some triggers (and surrounding infrastructure) to automatically queue
-- events for reindexing when they become (un-)listed by a change to
-- the block (and indirectly realm) structure. These changes lead to
-- a change in the host realms of the corresponding events, which the
-- index needs to pick up. This is simpler than doing it in application code.

create function queue_block_for_reindex(block blocks)
   returns void
   language sql
as $$
    with listed_events as (
        select id from events where id = block.video_id
        union all select id from events where series = block.series_id
    )
    insert into search_index_queue (item_id, kind)
    select id, 'event' from listed_events
    on conflict do nothing;
$$;

create function queue_blocks_for_reindex()
   returns trigger
   language plpgsql
as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_block_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_block_for_reindex(new);
    end if;
    return null;
end;
$$;

create trigger queue_blocks_for_reindex
after insert or delete or update of video_id, series_id
on blocks
for each row
execute procedure queue_blocks_for_reindex();
