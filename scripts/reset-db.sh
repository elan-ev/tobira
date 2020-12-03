#!/bin/sh

set -o errexit

export PGPASSFILE="$PWD/.pgpass"

dropdb -h localhost -U tobira tobira
createdb -h localhost -U tobira tobira
psql -h localhost tobira tobira -c '\i schema.sql;' -c '\i fixtures.sql;'
