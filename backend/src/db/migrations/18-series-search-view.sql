-- All of this is the preparation to store series in the search index.

-- Add view for series data that we put into the search index.
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
                select row(search_realms.id, name, full_path, ancestor_names)::search_realms
                from search_realms
                where search_realms.id = blocks.realm
            )),
            '{}'
        ) as host_realms
    from series
    left join blocks on type = 'series' and blocks.series = series.id
    group by series.id;


-- Next we need to change the 'kind' of things we can insert into the queue to
-- add 'series'.
alter type search_index_item_kind rename to search_index_item_kind_old;
create type search_index_item_kind as enum ('realm', 'event', 'series');
alter table search_index_queue
    alter column kind type search_index_item_kind using kind::text::search_index_item_kind;
drop type search_index_item_kind_old;


-- Add all triggers needed to automatically queue series whenever necessary.
create function queue_series_for_reindex_on_block_change(block blocks)
   returns void
   language sql
as $$
    with listed_series as (select id from series where id = block.series)
    insert into search_index_queue (item_id, kind)
    select id, 'series' from listed_series
    on conflict do nothing;
$$;

create function queue_series_on_blocks_change()
   returns trigger
   language plpgsql
as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_series_for_reindex_on_block_change(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_series_for_reindex_on_block_change(new);
    end if;
    return null;
end;
$$;

create trigger queue_series_on_blocks_change
after insert or delete or update of series
on blocks
for each row
execute procedure queue_series_on_blocks_change();


-- On some realm changes, some series have to be queued.
create function queue_series_on_realm_change()
   returns trigger
   language plpgsql
as $$
begin
    -- All series listed on the changed realm are queued.
    insert into search_index_queue (item_id, kind)
    select blocks.series, 'series'
    from blocks
    where type = 'series' and (blocks.realm = old.id or blocks.realm = new.id)
    on conflict do nothing;

    -- If the name of this realm has changed, we also need to queue all series
    -- included in child realms.
    if tg_op = 'UPDATE' and (
        old.name is distinct from new.name or
        old.name_from_block is distinct from new.name_from_block
    ) then
        -- We don't need to queue the series in the realm itself as that already
        -- happened above, hence the '/%'.
        insert into search_index_queue (item_id, kind)
        select blocks.series, 'series'
        from blocks
        inner join realms on realms.id = blocks.realm
        where blocks.type = 'series' and full_path like new.full_path || '/%'
        on conflict do nothing;
    end if;
    return null;
end;
$$;

create trigger queue_series_on_realm_change
after update of id, parent, full_path, name, name_from_block
on realms
for each row
execute procedure queue_series_on_realm_change();


-- And of course, if the series itself is changed, it has to be queued
create function queue_series_for_reindex(series series) returns void language sql as $$
    insert into search_index_queue (item_id, kind)
    values (series.id, 'series')
    on conflict do nothing
$$;

create function queue_touched_series_for_reindex()
   returns trigger
   language plpgsql
as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_series_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_series_for_reindex(new);
    end if;
    return null;
end;
$$;

create trigger queue_touched_series_for_reindex
after insert or delete or update
on series
for each row
execute procedure queue_touched_series_for_reindex();
