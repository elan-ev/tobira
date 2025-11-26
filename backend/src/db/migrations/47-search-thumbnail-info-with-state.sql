-- Adds event state to `search_thumbnail_info`.
-- Unfortunately this requires dropping and recreating dependent views.

drop view search_series;
drop view search_playlists;

drop function search_thumbnail_info_for_event;
drop type search_thumbnail_info;


create type search_thumbnail_info as (
    url text,
    live boolean,
    audio_only boolean,
    read_roles text[],
    state event_state
);

create function search_thumbnail_info_for_event(e events)
    returns search_thumbnail_info language 'sql' immutable
as $$
    select row(
        e.thumbnail,
        e.is_live,
        is_audio_only(e.tracks),
        e.read_roles,
        e.state
    )::search_thumbnail_info
$$;


-- Identical to the `search_series` definition in migration 43.
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

-- Identical to the `search_playlists` definition in migration 37.
create view search_playlists as
    select
        playlists.id, playlists.opencast_id,
        playlists.read_roles, playlists.write_roles,
        playlists.title, playlists.description, playlists.creator,
        playlists.entries, playlists.updated,
        array(
            select search_thumbnail_info_for_event(events.*) from events
                where opencast_id = any(event_entry_ids(playlists.entries))
        ) as thumbnails,
        coalesce(
            array_agg((
                select row(search_realms.*)::search_realms
                from search_realms
                where search_realms.id = blocks.realm
            )) filter(where blocks.realm is not null),
            '{}'
        ) as host_realms
    from playlists
    left join blocks on type = 'playlist' and blocks.playlist = playlists.id
    group by playlists.id;
