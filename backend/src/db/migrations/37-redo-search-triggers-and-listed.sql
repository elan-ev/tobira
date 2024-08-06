-- This migration recreates all triggers related to queuing items for the search
-- index (with the exceptions of users, see migration 28). This is done for multiple reasons:
--
-- * Triggers were adjusted in many migrations, making it difficult to see the
--   whole trigger situation at once.
-- * There were still bugs.
-- * Add additional triggers, for example to allow storing series/playlist
--   thumbnails in the index, or include text block content in the realm search
--   index.
--
-- Generally, these triggers are a bit looser and err on the side of "queue too
-- much", as that's the semantically correct thing to do and allows us to be
-- more flexible in the future, without having to change triggers every time.
-- However, there shouldn't be any triggers that queue a crazy amount of
-- unnecessary items.
--
-- Finally, by this migration also changes/fixes the "listed" logic. The
-- behavior was defined in PR #1211 and the DB still needed some adjustments,
-- in particular after adding playlist blocks.

---------- Cleanup -------------------------------------------------------------------------------
-- Drop all old triggers and functions used by those triggers
drop trigger queue_blocks_for_reindex on blocks;
drop trigger queue_touched_realm_for_reindex on realms;
drop trigger queue_realm_on_updated_series_title on series;
drop trigger queue_realm_on_updated_event_title on all_events;
drop trigger queue_touched_event_for_reindex on all_events;
drop trigger queue_all_events_of_touched_series_for_reindex on series;
drop trigger queue_touched_series_for_reindex on series;

drop function queue_blocks_for_reindex;
drop function queue_block_for_reindex;
drop function queue_touched_realm_for_reindex;
drop function queue_realm_for_reindex;
drop function queue_realm_on_updated_title;
drop function queue_touched_event_for_reindex;
drop function queue_all_events_of_touched_series_for_reindex;
drop function queue_touched_series_for_reindex;
drop function hosted_series_and_events;
drop function queue_all_events_of_series_for_reindex;
drop function queue_event_for_reindex;
drop function queue_series_for_reindex;



---------- Adjust views --------------------------------------------------------------------------

-- Adjust `search_events` to also include realms as host realms that include an
-- event via playlist. Last version in 26-more-event-search-data.sql. It also
-- adds `opencast_id` (because why not, we might want that in the future) and
-- `containing_playlists` (which also might be useful in the future).
drop view search_events;
create view search_events as
    select
        events.id, events.opencast_id, events.state,
        events.series, series.title as series_title,
        events.title, events.description, events.creators,
        events.thumbnail, events.duration,
        events.is_live, events.created, events.start_time, events.end_time,
        events.read_roles, events.write_roles,
        coalesce(
            array_agg(
                distinct
                row(search_realms.*)::search_realms
            ) filter(where search_realms.id is not null),
            '{}'
        ) as host_realms,
        not exists (
            select from unnest(events.tracks) as t where t.resolution is not null
        ) as audio_only,
        coalesce(
            array_agg(playlists.id)
                filter(where playlists.id is not null),
            '{}'
        ) as containing_playlists
    from all_events as events
    left join series on events.series = series.id
    -- This syntax instead of `foo = any(...)` to use the index, which is not
    -- otherwise used.
    left join playlists on array[events.opencast_id] <@ event_entry_ids(entries)
    left join blocks on (
        type = 'series' and blocks.series = events.series
        or type = 'video' and blocks.video = events.id
        or type = 'playlist' and blocks.playlist = playlists.id
    )
    left join search_realms on search_realms.id = blocks.realm
    group by events.id, series.id;


drop view search_series;
create view search_series as
    select
        series.id, series.state, series.opencast_id,
        series.read_roles, series.write_roles,
        series.title, series.description,
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
    from series
    left join blocks on type = 'series' and blocks.series = series.id
    group by series.id;



---------- Utility functions ---------------------------------------------------------------------

-- Returns whether the given block causes the given event to be listed.
--
-- Note: works well if you already have a specific event at hand, but is likely
-- slow in other cases.
create function does_block_make_event_listed(b blocks, event_id bigint, event_series bigint, event_oc_id text)
    returns boolean language 'sql' immutable
as $$
    select (
        b.type = 'video' and b.video = event_id
        or b.type = 'series' and b.series = event_series
        or b.type = 'playlist' and b.playlist in (
            select id from playlists
                where array[event_oc_id] <@ event_entry_ids(entries)
        )
    )
$$;

-- Returns all series, events and playlists that are hosted by the given realm.
-- They are returned in the form that can be directly inserted into
-- `search_index_queue`.
create or replace function search_items_hosted_by_realm(realm_id bigint)
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
            left join playlists on (type = 'playlist' and the_blocks.playlist = playlists.id)
            inner join events on (
                events.opencast_id = any(event_entry_ids(entries))
                or type = 'video' and the_blocks.video = events.id
                or type = 'series' and the_blocks.series = events.series
            )
        ),
        the_series as (
            select series.id, 'series'::search_index_item_kind
            from the_blocks
            inner join series on type = 'series' and the_blocks.series = series.id
        ),
        the_playlists as (
            select playlists.id, 'playlist'::search_index_item_kind
            from the_blocks
            inner join playlists on type = 'playlist' and the_blocks.playlist = playlists.id
        )
    select * from the_events
        union all select * from the_series
        union all select * from the_playlists
$$;

-- Returns all realms in the realm-subtree which root has `root_full_path`,
-- including the root itself.
create function realm_subtree_of(root_full_path text)
returns setof realms
language sql
as $$
    select * from realms
        where full_path = root_full_path
            -- All children (notice the '/'). It would be nicer to use
            -- `starts_with`, but currently, only `like` will use our index. So
            -- we need to escape for usage in `like`. Luckily, backslash and
            -- percent are disallowed in realm paths anyway.
            or full_path like replace(root_full_path, '_', '\\_') || '/%';
$$;

-- This function queues a full realm-subtree (including all hosted items). This
-- is necessary whenever a resolved realm name changes.
create function queue_subtree_on_realm_name_change(r realms)
returns void language plpgsql as $$
begin
    -- Queue all realms in the subtree, as well as all items hosted by any of those realms.
    insert into search_index_queue (item_id, kind)
    select id, 'realm' from realm_subtree_of(r.full_path)
    union all
    select h.* from realm_subtree_of(r.full_path) t, search_items_hosted_by_realm(t.id) as h
    on conflict do nothing;
end;
$$;

-- Queues a specific realm and all its directly hosted items.
create function queue_realm_and_hosted_items(realm_id bigint)
returns void language plpgsql as $$
begin
    perform queue_single_item_for_reindex(realm_id, 'realm');

    insert into search_index_queue (item_id, kind)
    select * from search_items_hosted_by_realm(realm_id)
    on conflict do nothing;
end;
$$;

-- Returns all realms that derive their names from the item with the given ID.
create function realms_deriving_name_from(item_id bigint, ty block_type)
returns setof realms
language sql
as $$
    select realms.*
    from blocks
    inner join realms on realms.name_from_block = blocks.id
    where blocks.type = ty and (
        blocks.video = item_id
        or blocks.series = item_id
        or blocks.playlist = item_id
    )
$$;

-- Calls `queue_subtree_on_realm_name_change` on all realms returned by
-- `realms_deriving_name_from`.
create function queue_subtrees_for_derived_realm_names(item_id bigint, ty block_type)
returns void language plpgsql as $$
declare
    deriving_realm realms;
begin
    for deriving_realm in select * from realms_deriving_name_from(item_id, ty) loop
        perform queue_subtree_on_realm_name_change(deriving_realm);
    end loop;
end;
$$;


-- Just a convenience function.
create function queue_single_item_for_reindex(id bigint, kind search_index_item_kind)
returns void language sql as $$
    insert into search_index_queue (item_id, kind)
    values (id, kind)
    on conflict do nothing
$$;



---------- Install triggers ----------------------------------------------------------------------

------- On event change ------------------------------------------------------
--
-- Requires queuing:
-- * the event itself
-- * the series (due to it using event thumbnails)
-- * all playlists containing the event (due to them using event thumbnails)
-- * on title change: propagate realm name change

create function queue_event_related_items_for_reindex(e all_events)
returns void language plpgsql as $$
begin
    -- Queue event itself
    perform queue_single_item_for_reindex(e.id, 'event');

    -- Queue its series
    if e.series is not null then
        perform queue_single_item_for_reindex(e.series, 'series');
    end if;

    -- Queue all playlists containing it
    insert into search_index_queue (item_id, kind)
    select id, 'playlist' from playlists where array[e.opencast_id] <@ event_entry_ids(entries)
    on conflict do nothing;
end;
$$;

create function queue_event_related_items_for_reindex_on_change()
returns trigger language plpgsql as $$
begin
    -- Queue event itself
    if tg_op <> 'INSERT' then
        perform queue_event_related_items_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_event_related_items_for_reindex(new);
    end if;

    -- On title change -> handle potentially derived name changes. We can
    -- ignore "inserts" as at that point, this cannot be a name source.
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.title is distinct from old.title) then
        perform queue_subtrees_for_derived_realm_names(old.id, 'video');
    end if;

    return null;
end;
$$;

create trigger queue_related_items_for_reindex_on_change
after insert or delete or update
on all_events
for each row
execute procedure queue_event_related_items_for_reindex_on_change();


------- On series change -----------------------------------------------------
--
-- Requires queuing:
-- * the series itself
-- * all its events (they use the series title)
-- * on title change: propagate realm name change

create function queue_series_related_items_for_reindex(s series)
returns void language plpgsql as $$
begin
    -- Queue series itself
    perform queue_single_item_for_reindex(s.id, 'series');

    -- Queue all its events
    insert into search_index_queue (item_id, kind)
    select id, 'event' from events where events.series = s.id
    on conflict do nothing;
end;
$$;

create function queue_series_related_items_for_reindex_on_change()
returns trigger language plpgsql as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_series_related_items_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_series_related_items_for_reindex(new);
    end if;

    -- On title change -> handle potentially derived name changes. We can
    -- ignore "inserts" as at that point, this cannot be a name source.
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.title is distinct from old.title) then
        perform queue_subtrees_for_derived_realm_names(old.id, 'series');
    end if;

    return null;
end;
$$;

create trigger queue_related_items_for_reindex_on_change
after insert or delete or update
on series
for each row
execute procedure queue_series_related_items_for_reindex_on_change();


------- On playlist change ---------------------------------------------------
--
-- Requires queuing:
-- * the playlist itself
-- * the its events (affects host_realms of the event)
-- * on title change: propagate realm name change

create function queue_playlist_related_items_for_reindex(p playlists)
returns void language plpgsql as $$
begin
    -- Queue playlist itself
    perform queue_single_item_for_reindex(p.id, 'playlist');

    -- Queue all its events
    insert into search_index_queue (item_id, kind)
    select id, 'event' from events where events.opencast_id = any(event_entry_ids(p.entries))
    on conflict do nothing;
end;
$$;

create function queue_playlist_related_items_for_reindex_on_change()
returns trigger language plpgsql as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_playlist_related_items_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_playlist_related_items_for_reindex(new);
    end if;

    -- On title change -> handle potentially derived name changes. We can
    -- ignore "inserts" as at that point, this cannot be a name source.
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.title is distinct from old.title) then
        perform queue_subtrees_for_derived_realm_names(old.id, 'playlist');
    end if;

    return null;
end;
$$;

create trigger queue_related_items_for_reindex_on_change
after insert or delete or update
on playlists
for each row
execute procedure queue_playlist_related_items_for_reindex_on_change();


------- On realm change ------------------------------------------------------
--
-- Requires queuing:
-- * the realm itself
-- * all its hosted items
-- * on resolved name change: whole subtree including hosted items

create function queue_realm_related_items_for_reindex_on_change()
returns trigger language plpgsql as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_realm_and_hosted_items(old.id);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_realm_and_hosted_items(new.id);
    end if;

    -- If the resolved name changed, we have to queue the whole subtree. INSERTs
    -- can be ignored as they don't have children, DELETEs can be ignored as
    -- all children will be automatically deleted as well.
    if tg_op = 'UPDATE' and (
        old.name is distinct from new.name
            or old.name_from_block is distinct from new.name_from_block
    ) then
        perform queue_subtree_on_realm_name_change(new);
    end if;

    return null;
end;
$$;

create trigger queue_related_items_for_reindex_on_change
after insert or delete or update
on realms
for each row
execute procedure queue_realm_related_items_for_reindex_on_change();


------- On block change ------------------------------------------------------
--
-- Requires queuing:
-- * The block's realm
-- * All hosted items of the block's realm (currently a bit overkill)
-- * If used as name source: full realm subtree and all hosted items

create function queue_block_related_items_for_reindex_on_change()
returns trigger language plpgsql as $$
declare
    r realms;
begin
    if tg_op <> 'INSERT' then
        perform queue_realm_and_hosted_items(old.realm);

        -- Queue the previously referenced items
        insert into search_index_queue (item_id, kind)
            -- The directly referenced items
            select *
                from (values
                    (old.video, 'event'::search_index_item_kind),
                    (old.series, 'series'::search_index_item_kind),
                    (old.playlist, 'playlist'::search_index_item_kind)
                ) as t (id, kind)
                where id is not null
        union all
            -- All events of series
            select id, 'event' from events where events.series = old.series
        union all
            -- All events of playlist
            select id, 'event' from events where events.opencast_id = any(event_entry_ids(
                (select entries from playlists where id = old.playlist)
            ))
        on conflict do nothing;
    end if;
    if tg_op <> 'DELETE' then
        perform queue_realm_and_hosted_items(new.realm);
    end if;

    -- If this block is used as a name source, we queue the whole subtree of its
    -- realm. We only care about UPDATEs as on inserts, the block cannot be
    -- used as name source yet, and deletes are not allowed for name-source
    -- blocks.
    r := (select row(realms.*) from realms where id = new.realm);
    if tg_op = 'UPDATE' and r.name_from_block = new.id then
        perform queue_subtree_on_realm_name_change(r);
    end if;

    return null;
end;
$$;

create trigger queue_related_items_for_reindex_on_change
after insert or delete or update
    -- Ignoring id, layout/view options and `index`
    of realm, type, text_content, series, video, playlist
on blocks
for each row
execute procedure queue_block_related_items_for_reindex_on_change();
