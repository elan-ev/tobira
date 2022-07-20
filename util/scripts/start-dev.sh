#!/usr/bin/env bash
#
# Starts the full development setup with dev-server, file-watching and
# auto-rebuilding. Only thing this doesn't do is start any docker containers.
#
# If 'without-login' is passed as first argument, the dev server forwards to
# port 3080 instead of 3090. This only makes sense if you don't want to start
# the auth-proxy for some reason.

basedir=$(dirname "$0")
source $basedir/common-vars.sh

target_port=3090
if [[ $1 == without-login ]]; then
    target_port=3080
fi


# Download frontend dependencies.
(cd frontend && npm i --no-save)

# Subshell for proper ctrl+c behavior. See 'watch-frontend.sh' for more info.
(
    trap 'kill 0' SIGINT;

    # Start dev server for auto reload
    penguin -p $our_port proxy localhost:$target_port &

    # Build everything once and start watching for filechanges
    $basedir/watch.sh
)
