-- Adds two different permission levels to realm entries.

-- The `flattened_*` roles contain the same roles, as well as those from each ancestor realm.
-- These are used to handle inheritance of these roles, and are completely handled by triggers:
-- When a child realm is inserted, it automatically inherits its parent's `flattened_*` roles,
-- and when a realm's roles get updated, the changes are propagated to every child realm down the tree.

alter table realms
    add column moderator_roles text[] not null default '{}',
    add column admin_roles text[] not null default '{}',
    add column flattened_moderator_roles text[] not null default '{}',
    add column flattened_admin_roles text[] not null default '{}';

alter table realms
    alter column flattened_moderator_roles drop default,
    alter column flattened_admin_roles drop default;


create function update_flattened_permissions_of_children()
returns trigger as $$
begin
    update realms
    set
        flattened_moderator_roles = (
            array(
                select unnest(new.flattened_moderator_roles)
                union
                select unnest(moderator_roles)
            )
        ),
        flattened_admin_roles = (
            array(
                select unnest(new.flattened_admin_roles)
                union
                select unnest(admin_roles)
            )
        )
    where parent = new.id;

    return null;
end;
$$ language plpgsql;

create function update_own_flattened_permissions()
returns trigger as $$
begin
    new.flattened_moderator_roles = (
        array(
            select unnest(
                (select flattened_moderator_roles from realms where id = new.parent)
            )
            union
            select unnest(new.moderator_roles)
        )
    );
    new.flattened_admin_roles = (
        array(
            select unnest(
                (select flattened_admin_roles from realms where id = new.parent)
            )
            union
            select unnest(new.admin_roles)
        )
    );

    return new;
end;
$$ language plpgsql;

create trigger set_flattened_permissions_after_update
after update
on realms
for each row
when (
    new.flattened_moderator_roles <> old.flattened_moderator_roles or
    new.flattened_admin_roles <> old.flattened_admin_roles
)
execute procedure update_flattened_permissions_of_children();

create trigger set_flattened_permissions_before_insert_or_update
before insert or update of 
    moderator_roles,
    admin_roles
on realms
for each row
execute procedure update_own_flattened_permissions();

