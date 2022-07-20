#!/usr/bin/env bash

basedir=$(dirname "$0")
source "$basedir"/common-vars.sh


# Regularly checks whether the Tobira port 3080 is open and once it is, reloads
# all browser sessions.
reload_once_port_is_open() {
    while ! lsof -i:3080 > /dev/null; do
        sleep 0.1s
    done
    $reload_command
}


cd "$basedir"/../../backend || exit 1

cargo build

cargo run -- export-api-schema ../frontend/src/schema.graphql
cargo run -- write-config ../docs/config.toml
reload_once_port_is_open &
cargo run -- serve
