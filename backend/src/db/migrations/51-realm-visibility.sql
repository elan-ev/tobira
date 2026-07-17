-- Adds two independent visibility toggles to realms

-- `visible`: Determines if the page is accessible to everyone or only to users who can moderate it.
-- `show_in_menu`: Determines if the page is included in navigation menus.
alter table realms
    add column visible boolean not null default true,
    add column show_in_menu boolean not null default true;
