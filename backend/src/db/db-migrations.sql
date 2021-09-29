-- This script creates the meta table to keep track of which migrations are
-- active in a DB.

create table if not exists __db_migrations (
    id bigint primary key,
    name text not null,
    applied_on timestamp not null,
    script text not null
);
