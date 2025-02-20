-- This migration adds an index to perform queries like `write_roles && $1` on the whole table.

create index idx_series_write_roles on series using gin (write_roles);
