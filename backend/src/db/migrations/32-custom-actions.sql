-- Adds a field for custom actions to `events`.
-- The field's entries are mappings of individual custom actions
-- and the respective roles that are allowed to carry out that action.

alter table events
    add column custom_action_roles jsonb;

-- The following function verifies that the custom action column and its
-- entries follow a predefined format.
create or replace function check_custom_actions_format() returns trigger as $$
declare
    col text := 'events.custom_action_roles';
    field record;
    element jsonb;
begin
    if jsonb_typeof(new.custom_action_roles) <> 'object' then
        raise exception '% is %, but should be a JSON object', col, jsonb_typeof(new.custom_actions);
    end if;

    for field in select * from jsonb_each(new.custom_action_roles) loop
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

create trigger check_custom_actions_format_on_upsert
    before insert or update on events
    for each row
    execute procedure check_custom_actions_format();
