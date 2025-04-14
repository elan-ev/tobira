-- Basically a copy of `34-event-view-and-deletion-timestamp.sql` but for series.
-- This adds a 'tobira_deletion_timestamp' column to series to mark series
-- that have been deleted but are either waiting for sync or still present
-- in Opencast due to a failed deletion on that end. It can be used to
-- detect these failed deletions by comparing it to the current time.

-- Furthermore, the 'series' table is renamed to 'all_series', and a new view
-- called 'series' is created to show all non-deleted records from 'all_series'.
-- This view practically replaces the former 'series' table and removes the
-- need to adjust all queries to check it a series has been deleted.

alter table series
    add column tobira_deletion_timestamp timestamp with time zone;

alter table series rename to all_series;

create view series as
    select * from all_series where tobira_deletion_timestamp is null;
