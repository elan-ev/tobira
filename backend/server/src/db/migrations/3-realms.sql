-- Creates the realms table, inserts the always-present root realm and adds
-- useful realm-related functions.

create type realm_order as enum ('by_index', 'alphabetic:asc', 'alphabetic:desc');

select prepare_randomized_ids('realm');

create table realms (
    id bigint primary key default randomized_id('realm'),
    parent bigint references realms on delete restrict,
    name text not null,
    path_segment text not null,

    -- Index to define an order of this realm and all its siblings. It defaults
    -- to max int such that newly added realms appear after manually ordered
    -- ones.
    index int not null default 2147483647,

    -- Ordering of the children. If this is not 'by_index', the 'index' field of
    -- the children is ignored. We sort again in the frontend then.
    child_order realm_order not null default 'alphabetic:asc',

    -- This is calculated by DB triggers: operations never have to set this value.
    full_path text not null,

    -- This makes sure that a realm path segment consists of an alphanumeric
    -- character followed by one or more alphanumeric characters or hyphens. In
    -- particular, this implies path segments are at least two characters long.
    -- This check is disabled for the root realm as it has an empty path
    -- segment.
    constraint valid_alphanum_path check (id = 0 or path_segment ~* '^[[:alnum:]][[:alnum:]\-]+$'),
    constraint has_parent check (id = 0 or parent is not null)
);

-- Full path to realm lookups happen on nearly every page view
create unique index idx_realm_path on realms (full_path);

-- Insert the root realm. Since that realm has to have the ID=0, we have to
-- set the sequence to a specific value. We can just apply inverse xtea to 0
-- to get the value we have to set the sequence to.
select setval(
    '__realm_ids',
    xtea(0, (select key from __xtea_keys where entity = 'realm'), false),
    false
);
insert into realms (name, parent, path_segment, full_path) values ('', null, '', '');



-- Triggers to update `full_path` ---------------------------------------------------------
--
-- The `full_path` column is completely managed by triggers to always have the
-- correct values according to `path_segment` and `parent`. Doing this is a bit
-- tricky.

-- The `before insert` trigger is straight forward because we know that there
-- don't exist any children yet that have to be updated. We make sure that
-- insert operations do not try to specifcy the `full_path` already since that
-- would be overwritten anyway.
create function set_full_realm_path() returns trigger as $$
begin
    if NEW.full_path is not null then
        raise exception 'do not set the full path of a realm directly (for realm %)', NEW.id;
    end if;

    NEW.full_path := (select full_path from realms where id = NEW.parent) || '/' || NEW.path_segment;
    return NEW;
end;
$$ language plpgsql;

-- However, handling updates gets interesting since we potentially have to
-- update a large number of (indirect) children. To visit all descendents of a
-- realm, we could have a recursive function, for example. But: changing those
-- descendents via `update` would cause the another trigger to get triggered! I
-- don't think one can avoid that. But we can just use this to our advantage
-- since then we don't have to do recursion ourselves.
--
-- So the idea is to just set the `full_path` of all children to a dummy value,
-- causing this trigger to get fired for all children, fixing the full path.
-- However, since the "fixing" involves querying the full path of the parent,
-- the update of the parent must be finished already before the child triggers
-- can run. In order to achieve that, we install both, `before update` and
-- `after update` triggers. Both call this function, which distinguishes the
-- two cases with `TG_WHEN`.
create function update_full_realm_path() returns trigger as $$
begin
    -- If only the name changed, we don't need to update anything.
    if
        NEW.path_segment = OLD.path_segment and
        NEW.parent = OLD.parent and
        NEW.full_path = OLD.full_path
    then
        return NEW;
    end if;

    if TG_WHEN = 'BEFORE' then
        -- If there was an attempt to change the full path directly and it wasn't
        -- us, we raise an exception.
        if NEW.full_path <> OLD.full_path and pg_trigger_depth() = 1 then
            raise exception 'do not change the full path directly (for realm %)', OLD.id;
        end if;

        -- If we are in the "before" handler, we set the correct full path.
        NEW.full_path := (select full_path from realms where id = NEW.parent)
            || '/' || NEW.path_segment;
        return NEW;
    else
        -- In the "after" handler, we update all children to recursively fire
        -- this trigger.
        update realms set full_path = '' where parent = NEW.id;
        return null;
    end if;
end;
$$ language plpgsql;

create trigger set_full_path_on_insert
    before insert on realms
    for each row
    execute procedure set_full_realm_path();

create trigger fix_full_path_before_update
    before update on realms
    for each row
    execute procedure update_full_realm_path();

create trigger fix_full_path_after_update
    after update on realms
    for each row
    execute procedure update_full_realm_path();


-- Useful functions ---------------------------------------------------------------------

-- Returns all ancestors of the given realm, including the root realm and the
-- given realm itself. Returns all columns plus a `height` column that counts
-- up, starting from the given realm which has `height = 0`.
create function ancestors_of_realm(realm_id bigint)
    returns table (
        id bigint,
        parent bigint,
        name text,
        path_segment text,
        index int,
        child_order realm_order,
        full_path text,
        height int
    )
    language 'sql'
as $$
with recursive ancestors(id, parent, name, path_segment, index, child_order, full_path) as (
    select *, 0 as height from realms
    where id = realm_id
  union
    select r.id, r.parent, r.name, r.path_segment, r.index, r.child_order, r.full_path, a.height + 1 as height
    from ancestors a
    join realms r on a.parent = r.id
    where a.id <> 0
)
SELECT * FROM ancestors order by height desc
$$;
