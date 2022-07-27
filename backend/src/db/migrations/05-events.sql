select prepare_randomized_ids('event');

-- Like series, events can exist in different states during their lifecycle:
-- `'waiting'`: The series was created "out of band" in regards to the
--     usual path of communication between Opencast and Tobira
--     (i.e. the harvesting protocol).
--     Thus, it might not have all its (meta-)data, yet,
--     and is *waiting* to be fully synced.
--     The updated timestamp should be `-infinity`, i.e. before
--     all other timestamps.
-- `'ready'`: The event is fully synced and up to date, as far as
--     Tobira is concerned. All of its mandatory data fields are set,
--     and the optional ones should reflect the state of the Opencast
--     event as of the last harvest.
create type event_state as enum ('waiting', 'ready');

create type event_track as (
    uri text,
    flavor text,
    mimetype text,
    resolution integer[2]
);

create table events (
    id bigint primary key default randomized_id('event'),

    state event_state not null,

    -- The Opencast UUID
    opencast_id text not null unique,

    -- Series.
    --
    -- Due to the harvesting API and other factors, it's possible that for some
    -- time (usually very shortly), we have an event that references a series
    -- that we don't know about yet. We deal with that by storing `part_of`
    -- which is the raw OC series ID of the event. If we have no series with
    -- that ID, `series` stays `null` and we pretend the event is not part of
    -- any series. Once we gain knowledge about the series, we fill the
    -- `series` field with the corresponding ID.
    --
    -- With that, it works the same way if a series is deleted: we just set
    -- `series` to `null` and pretend like the event is not associated with any
    -- series.
    series bigint references series on delete set null,
    part_of text,

    -- If `true`, this is a live event. In that case, `created` is the planned
    -- start date. Note: `true` does not imply it is _currently_ live streaming!
    is_live bool not null,

    -- Permissions: roles that are allowed to read/write
    -- The check makes sure there are no `null` elements in the array,
    -- and will be used for other arrays further down as well.
    read_roles text[] not null check (array_position(read_roles, null) is null),
    write_roles text[] not null check (array_position(read_roles, null) is null),

    -- Meta data
    title text not null,
    description text,
    duration int, -- in ms
    created timestamp with time zone not null,
    updated timestamp with time zone not null,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    
    creators text[] not null default '{}' check (array_position(creators, null) is null),

    -- Additional metadata as a JSON object, where each value is a string array.
    metadata jsonb not null,

    -- Media
    thumbnail text, -- URL to an image
    tracks event_track[] check (array_position(creators, null) is null),

    constraint ready_event_has_fields check (state <> 'ready' or (
        duration is not null
        and tracks is not null and array_length(tracks, 1) > 0
    )),
    constraint waiting_event_not_updated check (state <> 'waiting' or (
        updated = '-infinity'
    ))
);

-- To get all events of a series (which happens often), we can use this index.
create index idx_events_series on events (series);

-- To perform queries like `write_roles && $1` on the whole table. Probably just
-- to list all events that a user has write access to.
create index idx_events_write_roles on events using gin (write_roles);


-- The following triggers make sure that the extra JSON metadata is always in a
-- predefined format. There are multiple PostgreSQL extensions that do JSON
-- schema validation, but we don't want to rely on those to not add no
-- additional burden on the DB admin. But thus, this is a bit more verbose than
-- I'd like it to. The outer three `if`s are not technically necessary, but
-- result in better error messages.
create function check_metadata_format() returns trigger as $$
declare
    col text := 'events.metadata';
    namespace record;
    field record;
    element jsonb;
begin
    if jsonb_typeof(new.metadata) <> 'object' then
        raise exception '% is %, but should be a JSON object', col, jsonb_typeof(new.metadata);
    end if;

    for namespace in select * from jsonb_each(new.metadata) loop
        if jsonb_typeof(namespace.value) <> 'object' then
            raise exception '%: type of top level field "%" is %, but should be object',
                col,
                namespace.key,
                jsonb_typeof(namespace.value);
        end if;

        for field in select * from jsonb_each(namespace.value) loop
            if jsonb_typeof(field.value) <> 'array' then
                raise exception '%: type of field "%.%" is %, but should be array',
                    col,
                    namespace.key,
                    field.key,
                    jsonb_typeof(field.value);
            end if;

            for element in select * from jsonb_array_elements(field.value) loop
                if jsonb_typeof(element) <> 'string' then
                    raise exception '%: found non-string element "%" in "%.%", but that field should be a string array',
                        col,
                        element,
                        namespace.key,
                        field.key;
                end if;
            end loop;
        end loop;
    end loop;
    return new;
end;
$$ language plpgsql;

create trigger check_metadata_format_on_insert
    before insert or update on events
    for each row
    execute procedure check_metadata_format();
