-- This migration does two things:
-- * it fixes several bugs in '10-search-index-queue'
-- * it adds triggers that were missing/omitted in `19-series-search-view`
--
-- Both things are done in this one migration because this saves us some code
-- and results in fewer total triggers.


-- Previously this trigger was installed with `update of id, full_path, ...`.
-- Unfortunately, it is not triggered when `full_path` is changed via our
-- trigger mechanism. If we just omit the columns, it works. So here we replace
-- the trigger. But we also replace the function as we forgot one case
-- (see below).
drop trigger queue_touched_realm_for_reindex on realms;
drop function queue_touched_realm_for_reindex;

-- Returns all series and events that are hosted by the given realm. They are
-- returned in the form that can be directly inserted into
-- `search_index_queue`.
create or replace function hosted_series_and_events(realm_id bigint)
    returns table (id bigint, kind search_index_item_kind)
    language 'sql'
as $$
    with
        the_blocks as (
            select *
            from blocks
            where blocks.realm = realm_id
        ),
        the_events as (
            select events.id, 'event'::search_index_item_kind
            from the_blocks
            inner join events on (
                type = 'series' and the_blocks.series = events.series
                or type = 'video' and the_blocks.video = events.id
            )
        ),
        the_series as (
            select series.id, 'series'::search_index_item_kind
            from the_blocks
            inner join series on type = 'series' and the_blocks.series = series.id
        )
    select * from the_events union all select * from the_series
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

    if tg_op = 'UPDATE' then
        -- Events and series have to be queued as well. This was forgotten in
        -- the '10-search-index-queue' migration. Events were only queued on
        -- name change, but not if the path has changed.
        if old.full_path is distinct from new.full_path then
            insert into search_index_queue (item_id, kind)
            select * from hosted_series_and_events(new.id) -- assuming ID doesnt change
            on conflict do nothing;
        end if;

        -- If the name of this realm has changed, we also need to queue all child
        -- realms as their 'ancestor_names' have changed.
        if (
            old.name is distinct from new.name or
            old.name_from_block is distinct from new.name_from_block
        ) then
            insert into search_index_queue (item_id, kind)
            select id, 'realm'
            from realms
            where full_path like new.full_path || '/%'
            on conflict do nothing;

            -- We also need to queue all events and series that are included on
            -- any of those sub realms as they store their host realms. This
            -- time, we include the realm itself (note the '%' instead of '/%'
            -- above).
            insert into search_index_queue (item_id, kind)
            select h.*
            from realms, hosted_series_and_events(realms.id) as h
            where full_path like new.full_path || '%'
            on conflict do nothing;
        end if;
    end if;
    return null;
end;
$$;

create trigger queue_touched_realm_for_reindex
after insert or delete or update -- no "of" columns here
on realms
for each row
execute procedure queue_touched_realm_for_reindex();


-- If a video block is changed, previously only the specific video was queued.
-- But we said that a series and all its videos build one unit of being listed
-- or unlisted. When any video of a series is mounted or unmounted, the listed
-- status of potentially the whole unit changes.
--
-- Also, now series are queued.
create or replace function queue_block_for_reindex(block blocks)
   returns void
   language sql
as $$
    with
        -- The series that's involved: either via series block directly or the
        -- one of the video (which could be null).
        the_series(id) as (
            select series from events where id = block.video and series is not null
            union all select block.series where block.series is not null
        ),
        listed_events as (
            select id from events where id = block.video
            union all select events.id
                from the_series
                inner join events on events.series = the_series.id
        ),
        new_entries(id, kind) as (
            select id, 'series'::search_index_item_kind from the_series
            union all select id, 'event'::search_index_item_kind from listed_events
        )
    insert into search_index_queue (item_id, kind)
    select id, kind from new_entries
    on conflict do nothing;
$$;


-- This previously only queued the videos (and with the above change, series)
-- related to the changed block. However, if the block was a name source for
-- the realm, then we need to queue more realms.
create or replace function queue_blocks_for_reindex()
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

    -- If a realm was using this block as name source, we need to queue it and
    -- all its descendents. (We assume the block ID is never updated to
    -- simplify this code.)
    if tg_op = 'UPDATE' and exists(select from realms where name_from_block = new.id) then
        insert into search_index_queue (item_id, kind)
        select realms.id, 'realm'
        from realms
        where full_path like (select full_path from realms where name_from_block = new.id) || '%'
        on conflict do nothing;
    end if;

    return null;
end;
$$;
