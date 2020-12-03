#!/bin/sh

PGPASSFILE="$PWD/.pgpass" exec psql -h localhost tobira tobira
