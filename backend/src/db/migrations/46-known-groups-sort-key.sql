-- Add sort_key to known groups to give admins more control over sorting.

alter table known_groups
    add column sort_key text;
