create table realms (
    id bigint generated always as identity (start with 0 minvalue 0) primary key,
    parent bigint not null references realms on delete restrict,
    name text not null,
    path_segment text not null
);
-- To truncate this and restart the primary key counter:
--truncate realms restart identity;

insert into realms (name, parent, path_segment) values ('root', 0, '');
