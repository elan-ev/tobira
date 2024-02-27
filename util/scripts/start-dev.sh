#!/usr/bin/env bash
#
# Starts the full development setup with dev-server, file-watching and
# auto-rebuilding. Only thing this doesn't do is start any docker containers.

basedir=$(dirname "$0")
source "$basedir"/common-vars.sh


# Download frontend dependencies.
(cd frontend && npm i --no-save)

# Subshell for proper ctrl+c behavior. See 'watch-frontend.sh' for more info.
(
    trap 'kill 0' SIGINT;

    # Start dev server for auto reload
    penguin -p "$our_port" proxy localhost:3080 &

    # Build everything once and start watching for filechanges
    "$basedir"/watch.sh
)
