-- Creates the realms table and inserts the always-present root realm.

select prepare_randomized_ids('realm');

create table realms (
    id bigint primary key default randomized_id('realm'),
    parent bigint not null references realms on delete restrict,
    name text not null,
    path_segment text not null

    -- This makes sure that a realm path segment consists of an alphanumeric
    -- character followed by one or more alphanumeric characters or hyphens. In
    -- particular, this implies path segments are at least two characters long.
    -- This check is disabled for the root realm as it has an empty path
    -- segment.
    constraint valid_alphanum_path check (id = 0 or path_segment ~* '^[[:alnum:]][[:alnum:]\-]+$')
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
