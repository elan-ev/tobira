-- Adds a single `show_metadata` fields to blocks, used for series to also show
-- their description. We also drop and re-add the appropriate constraint.
alter table blocks
    add column show_metadata boolean default false,
    drop constraint series_block_has_fields,
    add constraint series_block_has_fields check (type <> 'series' or (
        videolist_order is not null and
        show_title is not null and
        show_metadata is not null
    ));
