-- Adds two new fields to `events`:
-- `slide_text` which holds a url pointing to the extracted slide text
-- generated in Opencast,
-- and `segments`, which holds a list of frames with their respective
-- starting time, and is needed for slide previews in paella.
-- Also creates the appropriate type for the segments and adjusts
-- the constraints. Basically an adjusted copy of `14-event-captions`.

create type event_segment as (
    uri text,
    start_time bigint -- in ms
);

alter table events
    add column slide_text text,
    add column segments event_segment[]
        default '{}'
        constraint no_null_segment_items check (array_position(segments, null) is null);

alter table events
    -- The default above was just for all existing records. New records should
    -- require this to be set.
    alter column segments drop default,
    drop constraint ready_event_has_fields,
    add constraint ready_event_has_fields check (state <> 'ready' or (
        duration is not null
        and tracks is not null and array_length(tracks, 1) > 0
        and captions is not null
        and segments is not null
    ));
