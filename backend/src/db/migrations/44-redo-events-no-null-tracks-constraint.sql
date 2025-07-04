-- There is already the `ready_event_has_fields` constraint in
-- 05-events.sql. The `no_null_tracks` constraint was added later
-- to also prevent `waiting` events from having no tracks, but
-- it turns out that we actually don't want that constraint for
-- the purpose of creating dummy events for waiting.
alter table all_events
    drop constraint no_null_tracks,
    add constraint no_null_tracks check (
        array_length(tracks, 1) = 0 or array_position(tracks, null) is null
    );
