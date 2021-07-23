-- Creates the realms table, inserts the always-present root realm and adds
-- useful realm-related functions.

select prepare_randomized_ids('realm');

create table realms (
    id bigint primary key default randomized_id('realm'),
    parent bigint references realms on delete restrict,
    name text not null,
    path_segment text not null

    -- This makes sure that a realm path segment consists of an alphanumeric
    -- character followed by one or more alphanumeric characters or hyphens. In
    -- particular, this implies path segments are at least two characters long.
    -- This check is disabled for the root realm as it has an empty path
    -- segment.
    constraint valid_alphanum_path check (id = 0 or path_segment ~* '^[[:alnum:]][[:alnum:]\-]+$'),
    constraint has_parent check (id = 0 or parent is not null)
);

-- Insert the root realm. Since that realm has to have the ID=0, we have to
-- set the sequence to a specific value. We can just apply inverse xtea to 0
-- to get the value we have to set the sequence to.
select setval(
    '__realm_ids',
    xtea(0, (select key from __xtea_keys where entity = 'realm'), false),
    false
);
insert into realms (name, parent, path_segment) values ('', null, '');


-- Returns all ancestors of the given realm, including the root realm and the
-- given realm itself. Returns all columns plus a `height` column that counts
-- up, starting from the given realm which has `height = 0`.
create function ancestors_of_realm(realm_id bigint)
    returns table (
        id bigint,
        parent bigint,
        name text,
        path_segment text,
        height int
    )
    language 'sql'
    stable
as $$
with recursive ancestors(id, parent, name, path_segment) as (
    select *, 0 as height from realms
    where id = realm_id
  union
    select r.id, r.parent, r.name, r.path_segment, a.height + 1 as height from ancestors a
    join realms r on a.parent = r.id
    where a.id <> 0
)
SELECT * FROM ancestors order by height desc
$$;


-- Returns the full realm path for the given realm. Returns an empty string for
-- the root realm. For non-root realms, the string starts with `/`, e.g.
-- `/foo/bar`.
create function full_realm_path(realm_id bigint)
    returns text
    language 'sql'
    stable
as $$
select string_agg(path_segment, '/') from (SELECT * FROM ancestors_of_realm(realm_id)) as t;
$$;
