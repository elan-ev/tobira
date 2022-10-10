-- Adds a `captions` field to `events`, also creates the appropriate type and
-- adjusts the constraints.

create type event_caption as (
    uri text,
    lang text
);

alter table events
    add column captions event_caption[]
        default '{}'
        check (array_position(captions, null) is null);

alter table events
    -- The default above was just for all existing records. New records should
    -- require this to be set.
    alter column captions drop default,
    drop constraint ready_event_has_fields,
    add constraint ready_event_has_fields check (state <> 'ready' or (
        duration is not null
        and tracks is not null and array_length(tracks, 1) > 0
        and captions is not null
    ));
