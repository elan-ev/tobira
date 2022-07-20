#!/usr/bin/env bash

basedir=$(dirname "$0")

# Subshell for proper ctrl+c behavior. See 'watch-frontend.sh' for more info.
(
    trap 'kill 0' SIGINT;
    "$basedir"/watch-frontend.sh &
    "$basedir"/watch-backend.sh
)
