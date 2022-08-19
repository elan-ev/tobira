#!/usr/bin/env bash

basedir=$(dirname "$0")
source "$basedir"/common-vars.sh

cd "$basedir"/../../frontend || exit 1

# This is created by webpack, but we need it to be present already as
# otherwise 'watchexec' will error when attempting to watch it.
mkdir -p build

# When this script is stopped with ctrl+c, we want all three long running
# commands to be stopped in the same way. We achieve this by spawning a
# subshell.
(
    trap 'kill 0' SIGINT;

    # Watch for any change in source files or the GraphQL schema and run the relay
    # compiler. We start it via explicit part as 'npx' adds about 200ms startup time.
    watchexec \
        --watch src \
        --ignore '**/__generated__/*' \
        -- '../util/scripts/clr.sh; ./node_modules/.bin/relay-compiler --output quiet-with-errors' &

    # Let webpack do the watching itself as startup time for webpack are really bad.
    npx webpack watch --mode=development --no-stats &

    # Watch the build directory to trigger a reload when webpack is done building.
    watchexec --watch build --postpone -- $reload_command
)
