#!/usr/bin/env bash

basedir=$(dirname "$0")
cd "$basedir"/../.. || exit 1

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "The git working directory is not clean. This will be visible in the version string"
    echo "of the generated Tobira binary. Are you sure you want to build anyway? (Write 'yes'!)"
    read -r answer
    if [[ $answer != yes ]]; then
        echo "Stopping..."
        exit 1;
    fi
fi


# Build frontend
cd frontend || exit 1
npm ci
npx relay-compiler
npm run build:release

# Build backend.
#
# We set some weird flags here to sanitize the paths embedded into the binary.
# Ideally, that should happen by default, but that has not been implemented
# yet. See `profile.trim-paths` (RFC 3127), which is not yet available on
# stable Cargo: https://github.com/rust-lang/cargo/issues/12137
#
# Several dependencies (e.g. 'ring', 'aws-lc-sys', 'tikv-jemalloc-sys') compile
# C or assembly files. So we also need to set the corresponding C flags. See here:
# https://github.com/briansmith/ring/issues/715
#
# Dependencies from crates.io are unpacked to
# `$CARGO_HOME/registry/src/index.crates.io-<hash>/<crate>-<version>/`. We remap
# everything up to `registry/src`, so we don't depend on the `<hash>` part,
# which differs between Cargo versions. `CARGO_HOME` defaults to `~/.cargo`,
# but can be set to something else.
cd ../backend || exit 1
registry_src="${CARGO_HOME:-$HOME/.cargo}/registry/src"
CFLAGS="-fdebug-prefix-map=$(pwd)=__src__ -fdebug-prefix-map=$registry_src=__dep__" \
    RUSTFLAGS="--remap-path-prefix=$(pwd)=<src> --remap-path-prefix=$registry_src=<dep>" \
    cargo build --release $([ "$1" == "--musl" ] && echo "--target=x86_64-unknown-linux-musl")

cd .. || exit 1

mkdir -p deploy
cp "backend/target$([ "$1" == "--musl" ] && echo "/x86_64-unknown-linux-musl")/release/tobira" deploy
objcopy --compress-debug-sections deploy/tobira
deploy/tobira write-config deploy/config.toml
