-- Updates/reapplies search views to omit deleted events and series.


drop view search_events;
create view search_events as
    select
        events.id, events.opencast_id, events.state,
        events.series, series.title as series_title,
        events.title, events.description, events.creators,
        events.thumbnail, events.duration,
        events.is_live, events.updated, events.created, events.start_time, events.end_time,
        events.read_roles, events.write_roles, events.preview_roles,
        coalesce(
            array_agg(
                distinct
                row(search_realms.*)::search_realms
            ) filter(where search_realms.id is not null),
            '{}'
        ) as host_realms,
        is_audio_only(events.tracks) as audio_only,
        coalesce(
            array_agg(playlists.id)
                filter(where playlists.id is not null),
            '{}'
        ) as containing_playlists,
        (
            select array_agg(t)
            from (
                select unnest(texts) as t
                from event_texts
                where event_id = events.id and ty = 'slide-text'
            ) as subquery
        ) as slide_texts,
        (
            select array_agg(t)
            from (
                select unnest(texts) as t
                from event_texts
                where event_id = events.id and ty = 'caption'
            ) as subquery
        ) as caption_texts,
        (events.credentials is not null) as has_password
    from all_events as events
    left join all_series as series
        on events.series = series.id
        and series.tobira_deletion_timestamp is null
    -- This syntax instead of `foo = any(...)` to use the index, which is not
    -- otherwise used.
    left join playlists on array[events.opencast_id] <@ event_entry_ids(entries)
    left join blocks on (
        type = 'series' and blocks.series = events.series
        or type = 'video' and blocks.video = events.id
        or type = 'playlist' and blocks.playlist = playlists.id
    )
    left join search_realms on search_realms.id = blocks.realm
    where events.tobira_deletion_timestamp is null
    group by events.id, series.id;


drop view search_series;
create view search_series as
    select
        series.id, series.state, series.opencast_id,
        series.read_roles, series.write_roles,
        series.title, series.description, series.updated, series.created, series.metadata,
        array(
            select search_thumbnail_info_for_event(events.*) from events
                where series = series.id
        ) as thumbnails,
        coalesce(
            array_agg((
                -- Using a nested query here improves the overall performance
                -- for the main use case: 'where id = any(...)'. If we would
                -- use a join instead, the runtime would be the same with or
                -- without the 'where id' (roughly 300ms on my machine).
                select row(search_realms.*)::search_realms
                from search_realms
                where search_realms.id = blocks.realm
            )) filter(where blocks.realm is not null),
            '{}'
        ) as host_realms
    from all_series as series
    left join blocks on type = 'series' and blocks.series = series.id
    where series.tobira_deletion_timestamp is null
    group by series.id;
