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


cache_folder="util/.db-dumps-cache"
if [ ! -d $cache_folder ]; then
    mkdir $cache_folder
fi


# Download dump
version_raw=$(sed -n -E 's/^version = "([^"]+)"$/\1/p' backend/Cargo.toml)
version=${version_raw%.0}
filename="db-dump-v${version}"
if [ -f "$cache_folder/$filename" ]; then
    echo "DB dump for $version is already downloaded -> using that."
    echo "To redownload, delete it from '$cache_folder'"
else
    echo "Downloading DB dump for $version"
    curl --output "$cache_folder/$filename.xz" -L "https://github.com/elan-ev/tobira/raw/db-dumps/$filename.xz"
    xz -d "$cache_folder/$filename.xz"
fi

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
    < "$cache_folder/$filename"
