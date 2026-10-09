#!/usr/bin/env bash

basedir=$(dirname "$0")

cd "$basedir"/../../frontend || exit 1

# Backend serves `index.html`, service worker, fonts, etc. from `build/`,
# so we build once up front.
# The app's code itself is loaded from vite's dev server.
./node_modules/.bin/relay-compiler --output quiet-with-errors
npm run build:dev || exit 1

# Spawn a subshell so both commands are stopped in the same way with ctrl+c.
(
    trap 'kill 0' SIGINT;

    # Watch for changes in source files or GraphQL schema and run relay compiler.
    watchexec \
        --watch src \
        --ignore '**/__generated__/*' \
        --postpone \
        -- '../util/scripts/clr.sh; ./node_modules/.bin/relay-compiler --output quiet-with-errors' &

    # Start dev server which serves the app's code and reloads pages when that code changes.
    ./node_modules/.bin/vite
)
