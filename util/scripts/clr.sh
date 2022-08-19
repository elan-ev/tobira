#!/usr/bin/env bash

# Just print a bunch of newlines. This is useful to kind of "clear" the screen,
# but still having previous output accessible. We only do anything if this has
# been invoked in response to a file change, so that we don't print a bunch of
# newlines when starting dev scripts.
if [[ ! -z "$WATCHEXEC_COMMON_PATH" ]]; then
    for i in {1..40}; do
       echo
    done
fi
