-- This adds a 'tobira_deletion_timestamp' column to events to mark videos
-- that have been deleted but are either waiting for sync or still present
-- in Opencast due to a failed deletion on that end. It can be used to
-- detect these failed deletions by comparing it to the current time.

-- Furthermore, the 'events' table is renamed to 'all_events', and a new view
-- called 'events' is created to show all non-deleted records from 'all_events'.
-- This view practically replaces the former 'events' table and removes the
-- need to adjust all queries to check it an event has been deleted.

alter table events
    add column tobira_deletion_timestamp timestamp with time zone;

alter table events rename to all_events;

create view events as
    select * from all_events where tobira_deletion_timestamp is null;
