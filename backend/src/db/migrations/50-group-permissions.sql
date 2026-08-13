--  Adds `assignable_by`: a mapping from action to the list of roles allowed to
-- assign that group for that action. Empty/missing entries for actions
-- mean that only admins can assign the group for that action (`read` is still
-- implied by `write`)
-- Also replaces the `large` boolean on known groups with `warn_for_action`
-- (a list of actions that should trigger a warning when assigned).
--
-- Existing groups are migrated to `warn_for_action = ['write']` (iff they
-- were `large`) and `assignable_by = { "write": ["ROLE_ANONYMOUS"] }`.
-- This preserves today's behavior (anyone can assign any group for any action).
-- Admins will have to manually adjust `assignable_by` after this migration (if needed).

alter table known_groups add column warn_for_action text[] not null default '{}';
update known_groups set warn_for_action = array['write'] where large;
alter table known_groups drop column large;

alter table known_groups
    add column assignable_by jsonb not null default '{"write": ["ROLE_ANONYMOUS"]}'::jsonb;
alter table known_groups alter column assignable_by drop default;

-- Verifies that `assignable_by` follows the expected format: a JSON object
-- mapping action names to arrays of role strings.
create or replace function check_known_groups_assignable_by_format() returns trigger as $$
declare
    col text := 'known_groups.assignable_by';
    field record;
    element jsonb;
begin
    if jsonb_typeof(new.assignable_by) <> 'object' then
        raise exception '% is %, but should be a JSON object', col, jsonb_typeof(new.assignable_by);
    end if;

    for field in select * from jsonb_each(new.assignable_by) loop
        if jsonb_typeof(field.value) <> 'array' then
            raise exception '%: type of field "%" is %, but should be an array',
                col,
                field.key,
                jsonb_typeof(field.value);
        end if;

        for element in select * from jsonb_array_elements(field.value) loop
            if jsonb_typeof(element) <> 'string' then
                raise exception '%: found non-string element "%" in field "%", but that field should be a string array',
                    col,
                    element,
                    field.key;
            end if;
        end loop;
    end loop;

    return new;
end;
$$ language plpgsql;

create trigger check_known_groups_assignable_by_format_on_upsert
    before insert or update on known_groups
    for each row
    execute procedure check_known_groups_assignable_by_format();
