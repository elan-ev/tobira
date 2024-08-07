#!/usr/bin/env bash

basedir=$(dirname "$0")
cd "$basedir"/../.. || exit 1

if ! command -v xz &> /dev/null; then
    >&2 echo "'xz' is not installed!"
    exit 1
fi
if ! (command -v docker &> /dev/null && docker compose &> /dev/null); then
    >&2 echo "'docker compose' is not installed! (Also see './x.sh check-system')"
    exit 1
fi


# Download dump
TMP_DIR=$(mktemp -d)
echo "Downloading DB dump"
curl --output "$TMP_DIR/db-dump.xz" -L https://github.com/elan-ev/tobira/raw/db-dumps/db-dump-latest.xz
xz -d "$TMP_DIR/db-dump.xz"

# Prompt to notify that the current DB is deleted.
echo
echo
echo "Will delete current DB in docker container and overwrite it with DB dump. Is that OK?"
echo "To cancel, ctrl+c! To continue, press enter."
read -r

set -x
docker compose -f "$basedir/../containers/docker-compose.yml" \
    exec -T tobira-dev-database \
    pg_restore \
    --dbname 'postgresql://tobira:tobira@localhost/postgres' \
    --clean \
    --create \
    --if-exists \
    < "$TMP_DIR/db-dump"
