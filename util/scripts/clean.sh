#!/usr/bin/env bash

basedir=$(dirname "$0")
cd "$basedir"/../.. || exit 1

(cd backend && cargo clean)
(cd frontend && npm run --silent clean:relay)
rm -rf frontend/node_modules
rm -rf frontend/build
rm -f frontend/tsconfig.tsbuildinfo
rm -rf deploy
