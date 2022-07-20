#!/usr/bin/env bash

basedir=$(dirname "$0")
cd "$basedir"/../.. || exit 1

# Build frontend
cd frontend || exit 1
npm ci
npx relay-compiler
npx webpack --progress --mode=production

#
cd ../backend || exit 1
cargo build --release

cd .. || exit 1

mkdir -p deploy
cp backend/target/release/tobira deploy
objcopy --compress-debug-sections deploy/tobira
cp util/dev-config/config.toml deploy
cp util/dev-config/logo-large.svg deploy
cp util/dev-config/logo-small.svg deploy
cp util/dev-config/favicon.svg deploy
cp util/dev-config/jwt-key.pem deploy
