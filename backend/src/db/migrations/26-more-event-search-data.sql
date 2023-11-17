-- This is almost the same definition as in `18-user-realms`, which again is
-- almost the same as in `11-search-views`.

create or replace view search_events as
    select
        events.id, events.state,
        events.series, series.title as series_title,
        events.title, events.description, events.creators,
        events.thumbnail, events.duration,
        events.is_live, events.created, events.start_time, events.end_time,
        events.read_roles, events.write_roles,
        coalesce(
            array_agg(
                distinct
                row(search_realms.*)::search_realms
            ) filter(where search_realms.id is not null),
            '{}'
        ) as host_realms,
        not exists (
            select from unnest(events.tracks) as t where t.resolution is not null
        ) as audio_only
    from events
    left join series on events.series = series.id
    left join blocks on (
        type = 'series' and blocks.series = events.series
        or type = 'video' and blocks.video = events.id
    )
    left join search_realms on search_realms.id = blocks.realm
    group by events.id, series.id;
