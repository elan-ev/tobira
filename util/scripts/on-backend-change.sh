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

"$basedir"/clr.sh
cd "$basedir"/../../backend || exit 1

cargo build || exit 1

# Only override schema if it changed. This is mainly to avoid 'clr.sh' being run
# needlessly. We invoke tobira twice to avoid having to deal with temporary
# files. The invocation is super fast anyway.
schema_out=../frontend/src/schema.graphql
./target/debug/tobira export-api-schema | cmp --silent - $schema_out \
    || ./target/debug/tobira export-api-schema $schema_out

./target/debug/tobira write-config ../docs/docs/setup/config.toml
reload_once_port_is_open &
./target/debug/tobira serve
