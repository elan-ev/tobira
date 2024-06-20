-- Adds tables, types and triggers to manage texts detected inside videos, e.g.
-- OCR'ed slide texts or subtitles.


-- A text paired with a timespan in a video. Both, `start` and `end`, are
-- specified in ms from the start of the video.
create type timespan_text as (
    span_start bigint,
    span_end bigint,
    t text
);


-- This table stores the parsed texts we fetched from Opencast.
create table event_texts (
    uri text not null,
    event_id bigint not null
        references all_events on delete cascade,
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
