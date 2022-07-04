-- Views for data that we put into the search index. It is slightly nicer
-- having it as view so that there does not have to be that much SQL code in
-- Rust strings.

create view search_realms as
    select
        id,
        name,
        full_path,
        array(select name from ancestors_of_realm(id) offset 1) as ancestor_names
    from realms;


create view search_events as
    select
        events.id,
        events.series, series.title as series_title,
        events.title, events.description, events.creators,
        events.thumbnail, events.duration,
        events.is_live, events.created,
        events.read_roles, events.write_roles,
        coalesce(
            array_agg(
                row(
                    realms.id,
                    name,
                    full_path,
                    array(
                        select name from ancestors_of_realm(realms.id)
                        offset 1
                    )
                )::search_realms
            ) filter(where realms.id is not null),
            '{}'
        ) as host_realms
    from events
    left join series on events.series = series.id
    left join realms on exists (
        select true as includes from blocks
        where realms.id = realm_id and (
            type = 'series' and series_id = events.series
            or type = 'video' and video_id = events.id
        )
    )
    group by events.id, series.id
