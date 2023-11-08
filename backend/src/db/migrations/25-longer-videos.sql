-- Changes the type of event.duration from i32 to i64.

do $$
    declare view_def text;
begin
    -- Unfortunately, the view depends on 'events' and prevents the type change.
    -- So we backup its defintion and drop it.
    view_def := pg_get_viewdef('search_events');
    drop view search_events;

    -- The actual change
    alter table events
        alter column duration type bigint;

    -- Recreate the view
    execute format('create view search_events as %s', view_def);
end $$;

