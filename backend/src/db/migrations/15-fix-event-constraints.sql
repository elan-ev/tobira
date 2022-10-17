-- Unfortunately there are some copy&paste bugs in the original migration script
-- for the `events` table. Some `check` constraints are refering to the wrong columns.
-- Affected columns are:
--
-- - `write_roles`
-- - `tracks`
--
-- The check constraints we put after these columns
-- accidentally refer to `read_roles` and `creators` respectively instead,
-- so that there are now two constraints checking `read_roles` and `creators`,
-- and none for `write_roles` and `tracks`.

-- To fix this, we delete the duplicated constraints using some meta programming magic.
-- This is a bit involved, because to delete a constraint you need its name, which is
-- automatically generated if you didn't provide one. How this is done is
-- an implementation detail, though. The only thing we get out of the meta tables
-- is which constraints touch which columns, so we go by that.
-- We also use the opportunity to give all the existing "anonymous" constraints proper names,
-- using similar trickery.


-- First, we create the proper, originally intended, and named constraints, though:
-- For that, we need to fix any potential violations that snuck in, as well

update events set
    write_roles = array_remove(write_roles, null),
    tracks = array_remove(tracks, null);

alter table events
    add constraint no_null_write_roles
        check (array_position(write_roles, null) is null),
    add constraint no_null_tracks
        check (array_position(tracks, null) is null);


-- Now, onto the cleanup and big renaming!

-- We need some way to get to the name of a constraint given only the columns involved in it.
create function constraints_by_columns(
    table_ information_schema.sql_identifier,
    columns text[]
) returns setof information_schema.sql_identifier as $$
    select constraint_name
        -- Note, we only really **need** `constraint_column_usage`, but that also contains
        -- information about `unique` constraints, so it makes our selections below
        -- less ... `unique`, funnily enough.
        -- `check_constraints` in turn also contains `not null` constraints, but these
        -- aren't in `constraint_column_usage`, so everything works out fine.
        from information_schema.check_constraints
            natural join information_schema.constraint_column_usage
        where table_name = table_
            and table_catalog = current_catalog
        group by constraint_name
            having array_agg(column_name::text) = columns;
$$ language sql;

-- Next we want to be able to drop a constraint based on this
create function drop_constraint_by_columns(
    table_ information_schema.sql_identifier,
    columns text[]
) returns void as $$
    declare constraint_ text;
    begin
        select constraints_by_columns(table_, columns) into constraint_;
        execute 'alter table ' || quote_ident(table_)
            || ' drop constraint ' || quote_ident(constraint_);
    end
$$ language plpgsql;

-- We also want to rename constraints based on it
create function rename_constraint_by_columns(
    table_ information_schema.sql_identifier,
    columns text[],
    name_ information_schema.sql_identifier
) returns void as $$
    declare constraint_ text;
    begin
        select constraints_by_columns(table_, columns) into strict constraint_;
        execute 'alter table ' || quote_ident(table_)
            || ' rename constraint ' || quote_ident(constraint_)
            || ' to ' || quote_ident(name_);
    end
$$ language plpgsql;


-- Drop the erroneous constraints
select drop_constraint_by_columns('events', '{read_roles}');
select drop_constraint_by_columns('events', '{creators}');

-- Rename all anonymous check constraints
select rename_constraint_by_columns('__xtea_keys', '{key}', 'valid_key');
select rename_constraint_by_columns('events', '{read_roles}', 'no_null_read_roles');
select rename_constraint_by_columns('events', '{creators}', 'no_null_creators');

drop function constraints_by_columns;
drop function drop_constraint_by_columns;
drop function rename_constraint_by_columns;
