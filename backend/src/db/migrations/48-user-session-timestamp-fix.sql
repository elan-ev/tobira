-- Migration 09 added this table and a comment says that 'created' is always
-- in UTC. It is always filled via 'now()' though, which returns a timestamp
-- of the local time zone. Luckily, this was consistently wrong everywhere, so
-- all calculations were still correct as long as the DB server would not change
-- its TZ.
--
-- To fix this, we convert the type to 'timestamptz'. Storing the time zone does
-- not cost any additional memory and the minimal extra work required by it is
-- well worth the benefit of not having TZ problems. The automatic conversion
-- from timestamp to timestamptz is to assume that the former has the local
-- timezone, which is exactly what we want here.
alter table user_sessions
    alter column created type timestamptz;
