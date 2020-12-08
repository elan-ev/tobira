-- Creates the realms table and inserts the always-present root realm.

create table realms (
    id bigint generated always as identity (start with 0 minvalue 0) primary key,
    parent bigint not null references realms on delete restrict,
    name text not null,
    path_segment text not null
);

insert into realms (name, parent, path_segment) values ('root', 0, '');
