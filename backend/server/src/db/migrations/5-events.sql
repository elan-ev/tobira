select prepare_randomized_ids('event');

create table events (
    id bigint primary key default randomized_id('event'),

    -- Opencast internal data
    opencast_id text not null unique,

    -- Meta data
    title text not null,
    description text,
    duration int not null, -- in seconds
    series bigint references series,

    -- Media
    thumbnail text not null,
    video text not null
);
