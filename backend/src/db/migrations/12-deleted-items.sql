-- This table is here to remember IDs of any items (events or series) that
-- Tobira once knew about. This is to ensure that once we associate a Tobira-ID
-- with an Opencast-ID, that this association never changes.
--
-- We first wanted to just add another state 'deleted' for series and events,
-- but that turned out to be a major pain because by using this soft-delete, we
-- are giving up a lot of useful delete semantics (foreign keys, triggers, ...)
-- and have to add more manual constraints. We also would have needed to adjust
-- quite a few pieces of the code. In the end, it seemed too fragile and this
-- solution is also recommended in a few places.

create type opencast_item_kind as enum ('event', 'series');

create table deleted_items (
    opencast_id text,
    kind opencast_item_kind,
    our_id bigint not null,

    primary key (opencast_id, kind)
);


-- Whenever an Opencast item is deleted, we automatically insert into this
-- table.
create function remember_deleted_opencast_items()
   returns trigger
   language plpgsql
as $$
begin
    insert into deleted_items (opencast_id, kind, our_id)
        values (old.opencast_id, tg_argv[0]::opencast_item_kind, old.id)
        on conflict do nothing;
    return null;
end;
$$;

create trigger remember_deleted_opencast_events
after delete
on events
for each row
execute procedure remember_deleted_opencast_items('event');

create trigger remember_deleted_opencast_series
after delete
on series
for each row
execute procedure remember_deleted_opencast_items('series');


-- We also install a trigger on insert of any Opencast item. In that case we
-- consult the 'delete_items' table to check whether we already assigned an ID
-- once.
create function reuse_existing_id_on_insert()
   returns trigger
   language plpgsql
as $$
declare
    remembered_id bigint;
begin
    delete from deleted_items
        where opencast_id = new.opencast_id and kind = tg_argv[0]::opencast_item_kind
        returning our_id into remembered_id;
    new.id := coalesce(remembered_id, new.id);
    return new;
end;
$$;

create trigger reuse_existing_id_on_event_insert
before insert
on events
for each row
execute procedure reuse_existing_id_on_insert('event');

create trigger reuse_existing_id_on_series_insert
before insert
on series
for each row
execute procedure reuse_existing_id_on_insert('series');
