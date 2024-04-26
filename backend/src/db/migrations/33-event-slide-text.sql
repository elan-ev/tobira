-- Adds a `slide_text` field to `events` which holds an url pointing 
-- to the extracted slide text generated in Opencast.

alter table events
    add column slide_text text;