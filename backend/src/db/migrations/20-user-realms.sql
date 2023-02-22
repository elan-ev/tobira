-- This adjusts the `realm` table such that it can also accommodate user realms.
-- This means that there is not only one realm tree, but a forest of realm
-- trees. One public one (which root has id = 0) and potentially one per user.
-- Most constraints are only slightly adjusted with code copied from
-- `03-realms.sql`.
--
-- Some terms that are used:
-- - A root realm is a realm with `parent = null`
-- - "The root realm" or "main root realm" is the realm with id = 0 which is the
--   root of the public realm tree.
-- - A "user root realm" is a root realm with id <> 0.

alter table realms
    -- Constraint `root_no_path` is still fine.

    -- There can be more root realms now.
    drop constraint has_parent,

    -- Adjust the logic to work with user root realms.
    drop constraint valid_name_source,
    add constraint valid_name_source check (
        -- The main root realm must not have a name
        (id = 0 and name is null and name_from_block is null)
        -- User root realms must have a plain name set
        or (id <> 0 and parent is null and name is not null and name_from_block is null)
        -- All other realms have either a plain or derived name.
        or (parent is not null and (name is null) != (name_from_block is null))
    ),

    -- All root realms (not just the id = 0 one) need to be exempt from the
    -- normal path rules.
    drop constraint valid_path,
    add constraint valid_path check (
        -- Main root realm
        (id = 0 and path_segment = '')
        -- For everything else, there are some general rules.
        or (
            id <> 0
            -- Exclude control characters.
            and path_segment !~ '[\u0000-\u001F\u007F-\u009F]'
            -- Exclude some whitespace characters.
            and path_segment !~ '[\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]'
            -- Exclude characters that are disallowed in URL paths or that have
            -- a semantic meaning there.
            and path_segment !~ $$["<>[\\\]^`{|}#%/?]$$
            -- Ensure at least two bytes (we want to reserve single ASCII char
            -- segments for internal use).
            and octet_length(path_segment) >= 2

            -- For realms that are not user root realms (parent is null), there
            -- are additional rules.
            -- There are additional rules depending on whether its a user root realm.
            and (
                -- User root realm: has to start with '@'.
                (parent is null and path_segment ~ '^@')
                -- All other realms: Exclude reserved characters in leading position.
                or (parent is not null and path_segment !~ $$^[-+~@_!$&;:.,=*'()]$$)
            )
        )
    );

-- We need to replace this trigger function which assumed `parent` to be non
-- null for inserted realms.
create or replace function set_full_realm_path() returns trigger as $$
begin
    if NEW.full_path is not null then
        raise exception 'do not set the full path of a realm directly (for realm %)', NEW.id;
    end if;

    -- New root realms (user root realms) just get their path segment with
    -- leading slash as path. Others concat with the parent's full path.
    if NEW.parent is null then
        NEW.full_path := '/' || NEW.path_segment;
    else
        NEW.full_path := (select full_path from realms where id = NEW.parent) || '/' || NEW.path_segment;
    end if;
    return NEW;
end;
$$ language plpgsql;
