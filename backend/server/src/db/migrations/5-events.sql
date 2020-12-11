select prepare_randomized_ids('event');

create table events (
    id bigint primary key default randomized_id('event'),

    -- Opencast internal data
    opencast_id text not null,

    -- Meta data
    title text not null,
    description text,
    series bigint references series,

    -- Media
    video text not null
);
