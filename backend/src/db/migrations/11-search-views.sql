-- Views for data that we put into the search index. It is slightly nicer
-- having it as view so that there does not have to be that much SQL code in
-- Rust strings.

create view search_realms as
    select
        realms.id,
        coalesce(realms.name, series.title, events.title) as name,
        realms.full_path,
        array(
            select ancestors.resolved_name
            from ancestors_of_realm(realms.id) ancestors
            offset 1
        ) as ancestor_names
    from realms
    left join blocks on blocks.id = realms.name_from_block
    left join events on blocks.video_id = events.id
    left join series on blocks.series_id = series.id;


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
                distinct
                row(search_realms.id, name, full_path, ancestor_names)::search_realms
            ) filter(where search_realms.id is not null),
            '{}'
        ) as host_realms
    from events
    left join series on events.series = series.id
    left join blocks on (
        type = 'series' and series_id = events.series
        or type = 'video' and video_id = events.id
    )
    left join search_realms on search_realms.id = blocks.realm_id
    group by events.id, series.id;
