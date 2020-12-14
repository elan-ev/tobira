-- Creates the realms table and inserts the always-present root realm.

select prepare_randomized_ids('realm');

create table realms (
    id bigint primary key default randomized_id('realm'),
    parent bigint not null references realms on delete restrict,
    name text not null,
    path_segment text not null
);

-- Insert the root realm. Since that realm has to have the ID=0, we have to
-- set the sequence to a specific value. We can just apply inverse xtea to 0
-- to get the value we have to set the sequence to.
select setval(
    '__realm_ids',
    xtea(0, (select key from __xtea_keys where entity = 'realm'), false),
    false
);
insert into realms (name, parent, path_segment) values ('root', 0, '');
