-- Table containing meta information about the synchronization to the connected
-- Opencast instance.
create table sync_status (
    -- The timestamp until which everything has been harvested. In UTC. This is
    -- an exclusive upper limit of the range, meaning that data changed at
    -- exactly this timestamp might not be harvested yet.
    harvested_until timestamp not null
);

insert into sync_status (harvested_until)
    values (timestamp '1970-01-01 00:00:00');
