-- Adjusts name_source constraint to allow custom names for root, including null.

alter table realms
    drop constraint valid_name_source,
    add constraint valid_name_source check (
       -- Root is allowed to have no name.
        (id = 0 and name is null or name_from_block is null)
        -- All other realms have either a plain or derived name.
        or (id <> 0 and (name is null) != (name_from_block is null))
    );
