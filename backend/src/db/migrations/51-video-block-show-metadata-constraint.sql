-- Makes video blocks also use `show_metadata`.

-- Ensure that all existing video blocks have a value for `show_metadata` (defaulting to false).
update blocks set show_metadata = false where type = 'video' and show_metadata is null;

alter table blocks
    drop constraint video_block_has_fields,
    add constraint video_block_has_fields check (type <> 'video' or (
        show_title is not null and
        show_link is not null and
        show_metadata is not null
    ));
