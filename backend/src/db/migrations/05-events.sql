select prepare_randomized_ids('event');

create type event_track as (
    uri text,
    flavor text,
    mimetype text,
    resolution integer[2]
);

create table events (
    id bigint primary key default randomized_id('event'),

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

    -- Permissions: roles that are allowed to read/write
    read_roles text[] not null,
    write_roles text[] not null,

    -- Meta data
    title text not null,
    description text,
    duration int not null, -- in ms
    created timestamp with time zone not null,
    updated timestamp with time zone not null,
    creators text[] not null
        default '{}'
        -- Make sure there are no `null` elements in the array.
        check (array_position(creators, null) is null),

    -- Media
    thumbnail text, -- URL to an image
    tracks event_track[] not null
);

-- To get all events of a series (which happens often), we can use this index.
create index idx_events_series on events (series);

-- To perform queries like `write_roles && $1` on the whole table. Probably just
-- to list all events that a user has write access to.
create index idx_events_write_roles on events using gin (write_roles);
