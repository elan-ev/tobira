-- All of this is the preparation to store series in the search index.

-- Add view for series data that we put into the search index.
create view search_series as
    select
        series.id, series.state, series.opencast_id,
        series.read_roles, series.write_roles,
        series.title, series.description,
        (select count(*) > 0
            from blocks
            inner join events on events.id = blocks.video
            where events.series = series.id
        ) as listed_via_events,
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


-- Add a trigger to automatically add a series to the queue whenever its changed
-- somehow.
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


-- But wait, there's more! There are multiple other cases when a series needs to
-- be queued for reindex. These are in the next migration, `19-fix-queue-triggers`
-- as they can be combined with some other stuff we have to fix.
