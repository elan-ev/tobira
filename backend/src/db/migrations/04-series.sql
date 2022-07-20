select prepare_randomized_ids('series');

-- Series can exist in different states during their lifecycle:
-- `'waiting'`: The series was created "out of band" in regards to the
--     usual path of communication between Opencast and Tobira
--     (i.e. the harvesting protocol).
--     Thus, it does not have all its (meta-)data, yet,
--     and is *waiting* to be fully synced.
--     This can currently only happen using the `mount`-API
--     used by the Opencast Admin UI.
--     In this state, only the Opencast ID is valid.
--     The value of all the other nullable fields is undefined,
--     and the updated timestamp should be `-infinity`, i.e. before
--     all other timestamps.
-- `'ready'`: The series is fully synced and up to date, as far as
--     Tobira is concerned. All of its mandatory data fields are set,
--     and the optional ones should reflect the state of the Opencast
--     series as of the last harvest.
create type series_state as enum ('waiting', 'ready');

create table series (
    id bigint primary key default randomized_id('series'),

    state series_state not null,

    -- Opencast internal data
    opencast_id text not null unique,

    -- Permissions: roles that are allowed to read/write
    read_roles text[],
    write_roles text[],

    -- Meta data
    title text,
    description text,
    updated timestamp with time zone not null,

    constraint ready_series_has_fields check (state <> 'ready' or (
        title is not null and
        read_roles is not null and
        write_roles is not null and
        updated <> '-infinity'
    )),
    constraint waiting_series_not_updated check (state <> 'waiting' or (
        updated = '-infinity'
    ))
);

create index idx_series_opencast_id on series (opencast_id);
