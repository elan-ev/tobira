-- Adds a single `show_metadata` field to blocks, used for video blocks to also show
-- metadata below the video player.

-- Ensure that all existing video blocks have a value for `show_metadata` (defaulting to false).
update blocks set show_metadata = false where type = 'video' and show_metadata is null;

alter table blocks
    drop constraint video_block_has_fields,
    add constraint video_block_has_fields check (type <> 'video' or (
        show_title is not null and
        show_link is not null and
        show_metadata is not null
    ));
