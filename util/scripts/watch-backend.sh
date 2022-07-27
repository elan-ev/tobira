#!/usr/bin/env bash

basedir=$(dirname "$0")
source "$basedir"/common-vars.sh

cd "$basedir"/../../ || exit 1
watchexec \
    --watch backend/src \
    --watch backend/Cargo.toml \
    --watch backend/Cargo.lock \
    --watch backend/build.rs \
    --watch util/dev-config/ \
    --restart -- "$basedir"/on-backend-change.sh
