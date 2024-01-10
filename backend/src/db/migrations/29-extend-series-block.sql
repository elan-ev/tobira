-- Adds a single `videolist_view` field to blocks, used for series to define the view
create type video_list_view as enum ('slider', 'gallery', 'list');

-- Add new `videolist_view` column with default value to initialize existing series blocks
alter table blocks
    add column videolist_view video_list_view default 'gallery';

-- Drop column default and add constraints to ensure that series blocks have all required fields
alter table blocks
    alter column videolist_view drop default,
    drop constraint series_block_has_fields,
    add constraint series_block_has_fields check (type <> 'series' or (
        videolist_order is not null and
        videolist_view is not null and
        show_title is not null and
        show_metadata is not null
    ));

-- Extend `video_list_order` type to support additional sort orders
alter type video_list_order add value 'a_to_z'; -- appends to list
alter type video_list_order add value 'z_to_a'; -- appends to list
