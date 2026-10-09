#!/usr/bin/env bash

basedir=$(dirname "$0")
source "$basedir"/common-vars.sh

cd "$basedir"/../../frontend || exit 1

# Whenever a file changes, run relay compiler, rebuild frontend, and then
# reload all browser sessions.
# If files change again in the meantime, start over.
watchexec \
    --watch src \
    --watch static \
    --ignore '**/__generated__/*' \
    --on-busy-update restart \
    -- "../util/scripts/clr.sh; ./node_modules/.bin/relay-compiler --output quiet-with-errors && npm run build:dev && $reload_command"
