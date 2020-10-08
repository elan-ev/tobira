create table realms (
    id int generated always as identity (start with 0 minvalue 0) primary key,
    parent int not null references realms on delete restrict,
    name text not null
);
-- To truncate this and restart the primary key counter:
--truncate realms restart identity;

insert into realms (name, parent) values ('root', 0);
