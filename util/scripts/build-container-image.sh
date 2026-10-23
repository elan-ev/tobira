#!/usr/bin/env bash

set -e

basedir=$(dirname "$0")
cd "$basedir"/../..

NODE_VERSION=22.15
RUST_VERSION=1.91

# Usage:
#
#   build-container-image.sh
#       Build the image for local use. The image is loaded into the local image
#       store and tagged `tobira:<version>` and `tobira:latest`. By default, it
#       is built for the platform of the machine this runs on.
#
#   build-container-image.sh push-by-digest
#       Build the image for a single platform and push it to the registry
#       *without tags*. Prints the resulting reference, `<image>@<digest>`, to
#       stdout. Needs a builder with a driver other than `docker`, e.g. one
#       created with `docker buildx create --driver docker-container --use`.
#
#   build-container-image.sh merge <image>@<digest>...
#       Combine images pushed via `push-by-digest` into one multi-platform image
#       and push that under the final tags. In CI, every platform is built on a
#       runner of that platform, and the results are merged in the end.
#
# Configuration via environment:
# - CONTAINER_PLATFORM: platform to build for, e.g. `linux/amd64`. Defaults to
#   the platform of the machine. Building a different platform requires
#   emulation (e.g. QEMU), which Docker Desktop and OrbStack provide. Multiple
#   platforms (comma separated) only work for local builds if Docker uses the
#   containerd image store.
# - IMAGE: name of the published image (without tag)
# - VERSION: version to tag with; defaults to `git describe`
IMAGE="${IMAGE:-ghcr.io/elan-ev/tobira}"
VERSION="${VERSION:-$(git describe --tags --always)}"

if [ "${1:-}" = merge ]; then
  shift

  # Only the newest release is tagged `latest`, such that building an older
  # version (e.g. for a backport) does not move it backwards. We ask the
  # upstream repository for its tags instead of relying on the local clone.
  newest_release="$(git ls-remote --tags --refs --sort=-v:refname https://github.com/elan-ev/tobira.git 'v[0-9]*' \
    | head -n 1 | sed 's#.*refs/tags/##')"
  if [ -z "${newest_release}" ]; then
    echo "Could not determine the newest release tag" >&2
    exit 1
  fi
  tag_args=(-t "${IMAGE}:${VERSION}")
  if [ "${VERSION}" = "${newest_release}" ]; then
    tag_args+=(-t "${IMAGE}:latest")
  fi

  docker buildx imagetools create "${tag_args[@]}" "$@"
  exit 0
fi

build_args=(
  --build-arg "NODE_VERSION=${NODE_VERSION}"
  --build-arg "RUST_VERSION=${RUST_VERSION}"
  --build-arg "BUILT_TIME_UTC=$(date -u +"%Y-%m-%dT%TZ")"
  --build-arg "GIT_COMMIT_HASH=$(git rev-parse HEAD || echo "unknown")"
  --build-arg "VERSION=${VERSION}"
  -f "util/containers/Dockerfile"
)
if [ -n "${CONTAINER_PLATFORM:-}" ]; then
  build_args+=(--platform "${CONTAINER_PLATFORM}")
fi

if [ "${1:-}" = push-by-digest ]; then
  if [ "$(docker buildx inspect | sed -n 's/^Driver: *//p')" = docker ]; then
    echo "Pushing by digest does not work with the 'docker' buildx driver." >&2
    echo "Create and select another builder first:" >&2
    echo "  docker buildx create --driver docker-container --use" >&2
    exit 1
  fi

  metadata_file="$(mktemp)"
  trap 'rm -f "${metadata_file}"' EXIT

  # The build output goes to stderr, such that stdout only contains the reference.
  docker buildx build "${build_args[@]}" \
    --output "type=image,name=${IMAGE},push-by-digest=true,name-canonical=true,push=true" \
    --provenance=false \
    --metadata-file "${metadata_file}" \
    . >&2
  echo "${IMAGE}@$(jq -r '."containerimage.digest"' "${metadata_file}")"
  exit 0
fi

docker buildx build "${build_args[@]}" \
  -t "tobira:${VERSION}" \
  -t "tobira:latest" \
  --load \
  .
