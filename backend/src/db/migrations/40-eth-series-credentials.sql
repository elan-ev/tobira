-- Adds a credentials column to series that hold series specific passwords and usernames.
-- These need to be synced with events that are part of the series.
-- This is specific for authentication requirements of the ETH and is only useful when the
-- `interpret_eth_passwords` configuration is enabled.

alter table series add column credentials credentials;

-- When the credentials of a series change, each event that is part of it also needs to be updated.
create function sync_series_credentials() returns trigger language plpgsql as $$
begin
    update all_events set credentials = series.credentials
    from series where all_events.series = series.id and series.id = new.id;
    return new;
end;
$$;

create trigger sync_series_credentials_on_change
after update on series
for each row
when (old.credentials is distinct from new.credentials)
execute function sync_series_credentials();

-- Tobira uploads do not automatically get the credentials of their assigned series, so this needs
-- to be done with an additional function and a trigger.
create function sync_credentials_before_event_insert() returns trigger language plpgsql as $$
begin
    select series.credentials into new.credentials
    from series
    where series.id = new.series;
    return new;
end;
$$;

create trigger sync_series_credentials_before_event_insert
before insert on all_events
for each row
execute function sync_credentials_before_event_insert();
