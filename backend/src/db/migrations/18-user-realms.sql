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


-- We add more fields to the realm search index to be able to filter by user
-- realms, for example. This replaces the view definition from
-- `11-search-views.sql`. There are two differences:
--
-- * We add `is_user_realm` and `is_root` columns.
-- * We removed the joins and the `coalesce` call by just `resolved_name`. I
--   found no difference in query performance for both, "query all" and `where
--   id = any('{a few IDs}'). So this simplifies the view.
create or replace view search_realms as
    select
        realms.id,
        realms.resolved_name as name,
        realms.full_path,
        array(
            select ancestors.resolved_name
            from ancestors_of_realm(realms.id) ancestors
            offset 1
        ) as ancestor_names,
        realms.full_path like '/@%' as is_user_realm,
        realms.parent is null as is_root
    from realms;

-- Due to the change of `search_realms`, we need to adjust the other two search
-- views as well, since the use `search_realms`: `row(...)::search_realms`. But
-- the "..." is a manual selection of four columns, so this fails after adding
-- two new columns to `search_realms`. The `search_series` view is changed in
-- place in `19-series-search-view.sql` as that migration was not yet released.
-- The `search_events` is recreated here (mostly copied from `11-search-views`).
create or replace view search_events as
    select
        events.id, events.state,
        events.series, series.title as series_title,
        events.title, events.description, events.creators,
        events.thumbnail, events.duration,
        events.is_live, events.created, events.start_time, events.end_time,
        events.read_roles, events.write_roles,
        coalesce(
            array_agg(
                distinct
                row(search_realms.*)::search_realms
            ) filter(where search_realms.id is not null),
            '{}'
        ) as host_realms
    from events
    left join series on events.series = series.id
    left join blocks on (
        type = 'series' and blocks.series = events.series
        or type = 'video' and blocks.video = events.id
    )
    left join search_realms on search_realms.id = blocks.realm
    group by events.id, series.id;
