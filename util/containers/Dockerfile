# syntax=docker/dockerfile:1.4

ARG NODE_VERSION
ARG RUST_VERSION


FROM --platform=${BUILDPLATFORM} docker.io/node:${NODE_VERSION}-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json /build/
RUN npm i

COPY frontend .
RUN npm ci
RUN npx relay-compiler
RUN npx webpack --mode=production


FROM docker.io/rust:${RUST_VERSION}-alpine AS backend-build

ENV CFLAGS    "-fdebug-prefix-map=/root/.cargo/registry/src/github.com-1ecc6299db9ec823/=__dep__"
ENV RUSTFLAGS "--remap-path-prefix=/build/backend=<src> --remap-path-prefix=/root/.cargo/registry/src/github.com-1ecc6299db9ec823/=<dep>"

WORKDIR /build/backend

RUN apk add --no-cache \
  make \
  musl-dev \
  perl

ARG RUST_TARGET
RUN rustup target add "${RUST_TARGET}"

COPY backend/Cargo.toml backend/Cargo.lock /build/backend/
COPY backend/vendor /build/backend/vendor
COPY <<EOF /build/backend/src/main.rs
fn main() {}
EOF
RUN cargo build --target "${RUST_TARGET}" --release

COPY --from=frontend-build /build/build /build/frontend/build
COPY backend .
ARG GIT_COMMIT_HASH
RUN cargo build --target "${RUST_TARGET}" --release
RUN cp "target/${RUST_TARGET}/release/tobira" .
RUN objcopy --compress-debug-sections tobira


FROM docker.io/rust:${RUST_VERSION}-alpine AS rootfs
RUN mkdir /rootfs \
 && apk add -p /rootfs --no-cache --initdb \
 && cp -R /etc/apk/repositories /etc/apk/keys /rootfs/etc/apk/ \
 && apk add -p /rootfs --no-cache \
      alpine-baselayout-data \
      ca-certificates-bundle \
      musl \
 && rm -rf \
      /rootfs/etc/apk \
      /rootfs/lib/apk \
      /rootfs/var/cache/apk
COPY --from=backend-build /build/backend/tobira /rootfs/tobira
RUN mkdir -p /rootfs/etc/tobira/ \
 && /rootfs/tobira write-config /rootfs/etc/tobira/config.toml \
 && sed -i '/\[http\]/,/^#address =.*$/ s/^#address =.*$/address = "0.0.0.0"/' /rootfs/etc/tobira/config.toml


FROM scratch AS final
ARG BUILT_TIME_UTC \
    GIT_COMMIT_HASH \
    VERSION

LABEL maintainer="The Opencast project" \
      org.opencontainers.image.created="${BUILT_TIME_UTC}" \
      org.opencontainers.image.authors="The Opencast project" \
      org.opencontainers.image.url="quay.io/opencast/tobira" \
      org.opencontainers.image.documentation="https://elan-ev.github.io/tobira/" \
      org.opencontainers.image.source="https://github.com/elan-ev/tobira" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT_HASH}" \
      org.opencontainers.image.vendor="ELAN e.V." \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="Tobira" \
      org.opencontainers.image.description="Video portal for Opencast"

COPY --from=rootfs /rootfs /
EXPOSE 3080
ENTRYPOINT [ "/tobira" ]
