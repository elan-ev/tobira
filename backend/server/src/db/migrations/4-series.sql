select prepare_randomized_ids('series');

create table series (
    id bigint primary key default randomized_id('series'),

    -- Opencast internal data
    opencast_id text not null unique,

    -- Meta data
    title text not null,
    description text
);
