-- Adds the possibility to derive the realm name from a block of that realm. For
-- non-root realms, exactly one of `name` and `name_from_block` is non-null.

alter table realms
    add column name_from_block bigint references blocks on delete restrict,
    add constraint valid_name_source check (
        -- Root realm doesn't have a name
        (id = 0 and name is null and name_from_block is null)
        -- All other realms have either a plain or derived name.
        or (id <> 0 and (name is null) != (name_from_block is null))
    );


-- The following triggers make sure that...
-- * `name_from_blocks` only references a block of THAT same realm
-- * the types of all blocks used as name source are either series or video

create function check_name_source_block_of_realm(block bigint, realm bigint) returns void as $$
begin
    if (select realm_id from blocks where id = block) <> realm then
        raise exception
            'a realm can only use its own blocks as name source (block %, realm %)',
            block, realm;
    end if;

    if (select type from blocks where id = block) != all(array['series', 'video']::block_type[]) then
        raise exception
            'a block that is used as realm name source must have the type "series" or "video" (block %, realm %)',
            block, realm;
    end if;
end;
$$ language plpgsql;

create function check_name_source_block_on_realm_change() returns trigger as $$
begin
    perform check_name_source_block_of_realm(new.name_from_block, new.id);
    return new;
end;
$$ language plpgsql;

create trigger check_name_source_block_on_realm_insert
    before insert on realms
    for each row
    when (new.name_from_block is not null)
    execute procedure check_name_source_block_on_realm_change();

create trigger check_name_source_block_on_realm_update
    before update on realms
    for each row
    when (new.name_from_block is not null
        and new.name_from_block is distinct from old.name_from_block)
    execute procedure check_name_source_block_on_realm_change();


create function check_block_as_name_source() returns trigger as $$
begin
    -- If the updated block is not used as name source, all is good.
    if (select name_from_block from realms where id = new.realm_id) <> new.id then
        return new;
    end if;

    perform check_name_source_block_of_realm(new.id, new.realm_id);
    return new;
end;
$$ language plpgsql;

create trigger check_name_source_block_on_block_update
    before update on blocks
    for each row
    when (new.realm_id is distinct from old.realm_id
        or new.type is distinct from old.type)
    execute procedure check_block_as_name_source();

