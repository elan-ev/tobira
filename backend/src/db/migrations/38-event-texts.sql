-- Adds tables, types and triggers to manage texts detected inside videos, e.g.
-- OCR'ed slide texts or subtitles.


-- A text paired with a timespan in a video. Both, `start` and `end`, are
-- specified in ms from the start of the video.
create type timespan_text as (
    span_start bigint,
    span_end bigint,
    t text
);

create type text_asset_type as enum ('caption', 'slide-text');


-- This table stores the parsed texts we fetched from Opencast.
create table event_texts (
    uri text not null,
    event_id bigint not null
        references all_events on delete cascade,
    ty text_asset_type not null,
    texts timespan_text[] not null,

    -- When the file was fetched & parsed.
    fetch_time timestamp with time zone not null,

    -- In theory the uri should be unique already, but just in case Opencast
    -- returns the same asset URL for two different events...
    primary key (uri, event_id)
);

create index idx_event_texts_event on event_texts (event_id);


-- This table acts as a queue where events are pushed whenever they need
-- (re)fetching of text-based resources.
create table event_texts_queue (
    event_id bigint primary key
        references all_events on delete cascade,

    -- Timestamp before which this queue entry should not be processed.
    fetch_after timestamp with time zone not null,

    -- How many times Tobira already unsuccesfully tried to fetch attachments
    -- for this event.
    retry_count int not null
);

create index idx_event_texts_queue_fetch_after on event_texts_queue (fetch_after);

-- Insert all events into the queue
insert into event_texts_queue (event_id, fetch_after, retry_count)
select id, updated, 0
    from events
    where array_length(captions, 1) > 0 or slide_text is not null;

-- Create triggers to automatically enqueue events when they are inserted or
-- updated. In the latter case, it's not sufficient to only act when the
-- captions or slide_text field has changed: the URL could stay the same but
-- the contents can change. Whenever the `updated` field is changed, the files
-- could have changed as well.
create function queue_event_for_text_extract()
    returns trigger
    language plpgsql
as $$
begin
    insert into event_texts_queue (event_id, fetch_after, retry_count)
    values (new.id, new.updated, 0)
    on conflict(event_id) do update set
        retry_count = 0,
        fetch_after = new.updated;
    return null;
end;
$$;

create trigger queue_event_for_text_extract_on_insert
after insert
on all_events for each row
when (array_length(new.captions, 1) > 0 or new.slide_text is not null)
execute procedure queue_event_for_text_extract();

create trigger queue_event_for_text_extract_on_update
after update of updated, slide_text, captions
on all_events for each row
execute procedure queue_event_for_text_extract();


-- This is almost the same definition as in migration `37`, only the `texts`
-- selected column was added.
create or replace view search_events as
    select
        events.id, events.opencast_id, events.state,
        events.series, series.title as series_title,
        events.title, events.description, events.creators,
        events.thumbnail, events.duration,
        events.is_live, events.updated, events.created, events.start_time, events.end_time,
        events.read_roles, events.write_roles,
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
        ) as caption_texts
    from all_events as events
    left join series on events.series = series.id
    -- This syntax instead of `foo = any(...)` to use the index, which is not
    -- otherwise used.
    left join playlists on array[events.opencast_id] <@ event_entry_ids(entries)
    left join blocks on (
        type = 'series' and blocks.series = events.series
        or type = 'video' and blocks.video = events.id
        or type = 'playlist' and blocks.playlist = playlists.id
    )
    left join search_realms on search_realms.id = blocks.realm
    group by events.id, series.id;


-- Add triggers to queue events for search indexing when their texts change.

create function queue_event_for_search_after_text_update()
   returns trigger
   language plpgsql
as $$
begin
    insert into search_index_queue (item_id, kind)
    select old.event_id, 'event'::search_index_item_kind where tg_op <> 'INSERT'
    union all
    select new.event_id, 'event'::search_index_item_kind where tg_op <> 'DELETE'
    on conflict do nothing;
    return null;
end;
$$;

create trigger queue_event_for_search_after_text_update
after insert or delete or update
on event_texts
for each row
execute procedure queue_event_for_search_after_text_update();
