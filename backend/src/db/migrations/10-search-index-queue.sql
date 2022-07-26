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


-- Triggers that automatically queue items for reindex.

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


-- On realm changes, some realms and events have to be queued.

create function queue_realm_for_reindex(realm realms) returns void language sql as $$
    insert into search_index_queue (item_id, kind)
    values (realm.id, 'realm')
    on conflict do nothing
$$;

create function queue_touched_realm_for_reindex()
   returns trigger
   language plpgsql
as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_realm_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_realm_for_reindex(new);
    end if;

    -- If the name of this realm has changed, we also need to queue all child
    -- realms as their 'ancestor_names' have changed.
    if tg_op = 'UPDATE' and (
        old.name is distinct from new.name or
        old.name_from_block is distinct from new.name_from_block
    ) then
        insert into search_index_queue (item_id, kind)
        select id, 'realm'
        from realms
        where full_path like new.full_path || '/%'
        on conflict do nothing;

        -- We also need to queue all events that are included on any of those
        -- sub realms as they store their host realms. This time, we include
        -- the realm itself (note the '%' instead of '/%' above).
        insert into search_index_queue (item_id, kind)
        select events.id, 'event'
        from events
        inner join blocks on (
            type = 'series' and series_id = events.series
            or type = 'video' and video_id = events.id
        )
        inner join realms on realms.id = blocks.realm_id
        where full_path like new.full_path || '%'
        on conflict do nothing;
    end if;
    return null;
end;
$$;

create trigger queue_touched_realm_for_reindex
after insert or delete or update of id, parent, full_path, name, name_from_block
on realms
for each row
execute procedure queue_touched_realm_for_reindex();


-- On series or event title changes, some realms and events have to be queued.

create function queue_realm_on_updated_title() returns trigger language plpgsql as $$
begin
    -- A realm is affected if it is a decendant of a realm which resolved names
    -- has changed due to the series/video title change.
    with affected_realms as (
        select affected.*
        from blocks
        inner join realms on blocks.id = realms.name_from_block
        inner join realms as affected on affected.full_path like realms.full_path || '%'
        -- Ho ho ho, this is interesting. To deduplicate some code, we use this
        -- function with both, events and series. And we don't even care which kind
        -- this function is called with. We just accept both. This is fine
        -- because: (a) a series and event having the same ID is exceeeeedingly
        -- rare, and (b) if this virtually impossible case actually arises, we just
        -- unnecessarily queue some events -> no harm done.
        where blocks.series_id = new.id or blocks.video_id = new.id
    )
    insert into search_index_queue (item_id, kind)
    -- The realms themselves have to be queued.
    select id, 'realm'::search_index_item_kind
    from affected_realms
    union all
    -- But also all events included somewhere in those realms.
    select events.id, 'event'::search_index_item_kind
    from affected_realms
    inner join blocks on affected_realms.id = blocks.realm_id
    inner join events on (
        type = 'series' and series_id = events.series
        or type = 'video' and video_id = events.id
    )
    on conflict do nothing;

    return null;
end;
$$;

create trigger queue_realm_on_updated_series_title
after update of title
on series
for each row
execute procedure queue_realm_on_updated_title();

create trigger queue_realm_on_updated_event_title
after update of title
on events
for each row
execute procedure queue_realm_on_updated_title();


-- On event changes, the event has to be queued.

create function queue_event_for_reindex(event events) returns void language sql as $$
    insert into search_index_queue (item_id, kind)
    values (event.id, 'event')
    on conflict do nothing
$$;

create function queue_touched_event_for_reindex()
   returns trigger
   language plpgsql
as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_event_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_event_for_reindex(new);
    end if;
    return null;
end;
$$;

create trigger queue_touched_event_for_reindex
after insert or delete or update
on events
for each row
execute procedure queue_touched_event_for_reindex();


-- On series changes, all events of that series has to be queued.

create function queue_all_events_of_series_for_reindex(series series) returns void language sql as $$
    insert into search_index_queue (item_id, kind)
    select events.id, 'event'
    from events
    where events.series = series.id
    on conflict do nothing
$$;

create function queue_all_events_of_touched_series_for_reindex()
   returns trigger
   language plpgsql
as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_all_events_of_series_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_all_events_of_series_for_reindex(new);
    end if;
    return null;
end;
$$;

create trigger queue_all_events_of_touched_series_for_reindex
after insert or delete or update
on series
for each row
execute procedure queue_all_events_of_touched_series_for_reindex();
