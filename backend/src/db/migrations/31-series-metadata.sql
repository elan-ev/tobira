-- Adds `metadata` and `created` fields to `series`. Also adjusts the
-- `check_metadata_format` function from `events` to be usable in both
-- contexts, and adds new triggers.

alter table series
    add column created timestamp with time zone,
    add column metadata jsonb;

drop trigger check_metadata_format_on_insert on events;
drop function check_metadata_format;

-- The following function makes sure that the extra JSON metadata is always in a
-- predefined format. It is identical to the function defined in `05-events.sql`,
-- with the addition of a mandatory argument to declare which table is checked.
-- This can be either `events` or `series`, but can in theory be any table whose
-- entries include a `metadata` field.
create or replace function check_metadata_format() returns trigger as $$
declare
    col text := tg_argv[0] || '.metadata';
    namespace record;
    field record;
    element jsonb;
begin
    if jsonb_typeof(new.metadata) <> 'object' then
        raise exception '% is %, but should be a JSON object', col, jsonb_typeof(new.metadata);
    end if;

    for namespace in select * from jsonb_each(new.metadata) loop
        if jsonb_typeof(namespace.value) <> 'object' then
            raise exception '%: type of top level field "%" is %, but should be object',
                col,
                namespace.key,
                jsonb_typeof(namespace.value);
        end if;

        for field in select * from jsonb_each(namespace.value) loop
            if jsonb_typeof(field.value) <> 'array' then
                raise exception '%: type of field "%.%" is %, but should be array',
                    col,
                    namespace.key,
                    field.key,
                    jsonb_typeof(field.value);
            end if;

            for element in select * from jsonb_array_elements(field.value) loop
                if jsonb_typeof(element) <> 'string' then
                    raise exception '%: found non-string element "%" in "%.%", but that field should be a string array',
                        col,
                        element,
                        namespace.key,
                        field.key;
                end if;
            end loop;
        end loop;
    end loop;
    return new;
end;
$$ language plpgsql;

create trigger check_event_metadata_format_on_upsert
    before insert or update on events
    for each row
    execute procedure check_metadata_format('events');

create trigger check_series_metadata_format_on_upsert
    before insert or update on series
    for each row
    execute procedure check_metadata_format('series');
