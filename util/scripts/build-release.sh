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
npx webpack --progress --mode=production

# Build backend.
#
# We set some weird flags here to sanitize the paths embedded into the binary.
# Ideally, that should happen by default, but that has not been implemented
# yet. See this RFC: https://github.com/rust-lang/rfcs/pull/3127
#
# Also, the dependency 'ring' does something special with compiling C or
# assembly files. So we also need to set the corresponding C flag. See here:
# https://github.com/briansmith/ring/issues/715
#
# The long Cargo registry path is actually fixed, despite its looks. The hash in
# there is just the one for the crates.io registry, but we don't use any other
# crate registries, so it's fine. And yes, people could have installed cargo
# elsewhere... we can still add support for that later.
cd ../backend || exit 1
CFLAGS="-fdebug-prefix-map=$HOME/.cargo/registry/src/github.com-1ecc6299db9ec823/=<dep>" \
    RUSTFLAGS="--remap-path-prefix=$(pwd)=<src> --remap-path-prefix=$HOME/.cargo/registry/src/github.com-1ecc6299db9ec823/=<dep>" \
    cargo build --release

cd .. || exit 1

mkdir -p deploy
cp backend/target/release/tobira deploy
objcopy --compress-debug-sections deploy/tobira
deploy/tobira write-config deploy/config.toml
