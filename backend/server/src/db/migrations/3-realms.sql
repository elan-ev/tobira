-- Creates the realms table, inserts the always-present root realm and adds
-- useful realm-related functions.

select prepare_randomized_ids('realm');

create table realms (
    id bigint primary key default randomized_id('realm'),
    parent bigint references realms on delete restrict,
    name text not null,
    path text not null,

    -- This makes sure that a realm path segment consists of an alphanumeric
    -- character followed by one or more alphanumeric characters or hyphens. In
    -- particular, this implies path segments are at least two characters long.
    -- This check is disabled for the root realm as it has an empty path
    -- segment.
    constraint valid_alphanum_path check (id = 0 or path ~* '^(/[[:alnum:]][[:alnum:]\-]+)+$'),
    constraint has_parent check (id = 0 or parent is not null)
);

-- Full path to realm lookups happen on nearly every page view
create unique index idx_realm_path on realms (path);

-- Insert the root realm. Since that realm has to have the ID=0, we have to
-- set the sequence to a specific value. We can just apply inverse xtea to 0
-- to get the value we have to set the sequence to.
select setval(
    '__realm_ids',
    xtea(0, (select key from __xtea_keys where entity = 'realm'), false),
    false
);
insert into realms (name, parent, path) values ('', null, '');


-- Returns all ancestors of the given realm, including the root realm and the
-- given realm itself. Returns all columns plus a `height` column that counts
-- up, starting from the given realm which has `height = 0`.
create function ancestors_of_realm(realm_id bigint)
    returns table (
        id bigint,
        parent bigint,
        name text,
        path text,
        height int
    )
    language 'sql'
    stable
as $$
with recursive ancestors(id, parent, name, path) as (
    select *, 0 as height from realms
    where id = realm_id
  union
    select r.id, r.parent, r.name, r.path, a.height + 1 as height from ancestors a
    join realms r on a.parent = r.id
    where a.id <> 0
)
SELECT * FROM ancestors order by height desc
$$;
