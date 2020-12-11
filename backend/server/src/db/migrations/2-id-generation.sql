-- Set up the necessary means for our pseudo-randomized ID-generation.
-- The basic idea is that there is a `sequence` and an XTEA encryption key
--
-- To use these facilities for a table, just call
--
-- ```sql
-- call prepare_randomized_ids('my_entity');
-- ```
--
-- where `'my_entity'` is just some descriptive name you pick.
--
-- Then you can use something like the following as your primary key:
--
-- ```sql
-- -- [...]
-- id bigint primary key default randomized_id('my_entity'),
-- -- [...]
-- ```

create extension pgcrypto;

-- Create a table to hold encryption keys for the `xtea` function,
-- one per relation where we want to "randomize" the IDs, to avoid
-- being able to cross-guess the sequence.
create table __xtea_keys (
    entity text primary key,
    key bytea unique not null unique check (octet_length(key) = 16) default gen_random_bytes(16)
);

create function prepare_randomized_ids(entity text) returns void
language plpgsql
as $$ begin
    execute 'create sequence ' || quote_ident('__' || entity || '_ids') || ';';
    insert into __xtea_keys (entity) values (entity);
end; $$;

-- Note that this function can't be used in a `generated` column,
-- like `identity` columns, since it is not `immutable`. :(
create function randomized_id(entity text) returns bigint
language sql
as $$
    select xtea(
        nextval(('__' || $1 || '_ids')::regclass),
        (select key from __xtea_keys where entity = $1),
        true
    );
$$;
