-- In '18-user-realms.sql', we mistakenly still defined the constraint in a way
-- that forbids derived names for user root realms.

alter table realms
    -- Adjust the logic to work with user root realms.
    drop constraint valid_name_source,
    add constraint valid_name_source check (
        -- The main root realm must not have a name
        (id = 0 and name is null and name_from_block is null)
        -- All other realms have either a plain or derived name.
        or (id <> 0 and (name is null) != (name_from_block is null))
    );
