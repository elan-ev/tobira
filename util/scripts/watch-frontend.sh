#!/usr/bin/env bash

basedir=$(dirname "$0")

cd "$basedir"/../../frontend || exit 1

# Backend serves `index.html`, service worker, fonts, etc. from `build/`,
# so we build once up front.
# The app's code itself is loaded from vite's dev server.
# This also generates the Relay artifacts and translation types before
# `tsc --watch` starts, which doesn't reliably notice them appearing later.
./node_modules/.bin/relay-compiler --output quiet-with-errors
npm run build:dev || exit 1

# Spawn a subshell so all commands inside are stopped in the same way with ctrl+c.
(
    trap 'kill 0' SIGINT;

    # Watch for changes in source files or GraphQL schema and run relay compiler.
    watchexec \
        --watch src \
        --ignore '**/__generated__/*' \
        --postpone \
        -- '../util/scripts/clr.sh; ./node_modules/.bin/relay-compiler --output quiet-with-errors' &

    # Vite doesn't check types, so we run TypeScript alongside.
    # See also https://vite.dev/guide/features#transpile-only
    ./node_modules/.bin/tsc --watch --preserveWatchOutput &

    # Start dev server which serves the app's code and reloads pages when that code changes.
    ./node_modules/.bin/vite
)
