-- Adds a single `show_link` field to blocks, used for video blocks to also show
-- a link to the corresponding video page. We also drop and re-add the appropriate constraint.
alter table blocks
    add column show_link boolean default false,
    drop constraint video_block_has_fields,
    add constraint video_block_has_fields check (type <> 'video' or (
        show_title is not null and
        show_link is not null
    ));
    