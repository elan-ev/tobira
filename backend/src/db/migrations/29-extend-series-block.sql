-- This adds a single `videolist_layout` field of type `video_list_layout` to
-- blocks, used for series to define the layout.

create type video_list_layout as enum ('slider', 'gallery', 'list');

-- Add new `videolist_layout` column with default value to initialize existing series blocks
alter table blocks
    add column videolist_layout video_list_layout default 'gallery';

-- Drop column default and add constraints to ensure that series blocks have all required fields
alter table blocks
    alter column videolist_layout drop default,
    drop constraint series_block_has_fields,
    add constraint series_block_has_fields check (type <> 'series' or (
        videolist_order is not null and
        videolist_layout is not null and
        show_title is not null and
        show_metadata is not null
    ));

-- Extend `video_list_order` type to support additional sort orders
alter type video_list_order add value 'a_to_z';
alter type video_list_order add value 'z_to_a';
