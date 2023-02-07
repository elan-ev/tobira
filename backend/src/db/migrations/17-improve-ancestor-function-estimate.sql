-- This function is used a lot and PostgreSQL estimates it to return 1000 rows
-- each time. Which is wildly incorrect. Of course this varies, but on the big
-- test data set it's 4.26 on average. Fixing this estimation improves the
-- query plan for a few big queries.
alter function ancestors_of_realm(realm_id bigint) rows 4;
