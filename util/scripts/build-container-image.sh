#!/usr/bin/env bash

set -e

basedir=$(dirname "$0")
cd "$basedir"/../..

NODE_VERSION=22.15
RUST_VERSION=1.86

CONTAINER_PLATFORM="${CONTAINER_PLATFORM:-linux/amd64}"
RUST_TARGET="${RUST_TARGET:-x86_64-unknown-linux-musl}"

BUILT_TIME_UTC="$(date -u +"%Y-%m-%dT%TZ")"
GIT_COMMIT_HASH="$(git rev-parse --short HEAD || echo "unknown")"
VERSION="$(sed -n -E 's/^version = "([^"]+)"$/\1/p' backend/Cargo.toml)"

docker buildx build \
  --platform "${CONTAINER_PLATFORM}" \
  --build-arg "NODE_VERSION=${NODE_VERSION}" \
  --build-arg "RUST_VERSION=${RUST_VERSION}" \
  --build-arg "RUST_TARGET=${RUST_TARGET}" \
  --build-arg "BUILT_TIME_UTC=${BUILT_TIME_UTC}" \
  --build-arg "GIT_COMMIT_HASH=${GIT_COMMIT_HASH}" \
  --build-arg "VERSION=${VERSION}" \
  -f "util/containers/Dockerfile" \
  -t "quay.io/opencast/tobira:latest" \
  -t "quay.io/opencast/tobira:${VERSION}" \
  .
