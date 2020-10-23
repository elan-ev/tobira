# Tobira: an Opencast Video Portal

![CI Status](https://github.com/elan-ev/tobira/workflows/CI/badge.svg)
![License](https://img.shields.io/github/license/elan-ev/tobira)
![Status: alpha](https://img.shields.io/badge/status-alpha-red)

__The project is in its *very* early stages, there is nothing to see here yet.__

## Structure

Tobira consists of two parts:

- `frontend` contains the web interface written in TypeScript/React.
- `backend` contains the video portal backend written in Rust which takes care of data persistence and communication to Opencast.


## How to build Tobira

### 1. Development Tools

Make sure you have the following tools installed:

- backend: [`rustc` and `cargo`](https://rustup.rs)
- frontend: [`node` and `npm`](https://nodejs.org)
- (optional) build helper: [`floof`](https://github.com/LukasKalbertodt/floof)


### 2. Database

Tobira needs a PostgreSQL database.
The `scripts` directory contains a [container compose file](https://docs.docker.com/compose) to easily spin one up.

```sh
cd scripts/
# using docker
docker-compose up -d
# using podman
podman-compose up -d
```

Find more information in the [docker compose docs](https://docs.docker.com/compose).


### 3. GraphQL Schema

Export the current API's GraphQL schema to be used by the frontend.
You need to do this whenever the API changes.

```sh
cd backend/
cargo run --bin export-schema -- ../frontend/src/schema.graphql
```

### 4. Frontend

Use npm to build the TypeScript/React based frontend.

```sh
cd frontend/
npm ci
npx relay-compiler
npm run build:dev
```

### 5. Backend

Use cargo to build and run the Rust based backend.

```sh
cd backend/
# build only
cargo build
# build and run
cargo run
```

## Auto-Rebuilds

> Make sure to manually build once before trying this!

You can use [`floof`](https://github.com/LukasKalbertodt/floof) to make builds easier.
This will watch all files, recompile/build changes and provide a development server that automatically reloads Tobira.

```sh
# run floof
floof
# run with configuration file
floof -c floofy.yaml
```

To locally modify the workflow:

- Copy the configuration: `cp floof.yaml floofy.yaml`
- Tell git to ignore your copy: `echo /floofy.yaml >> .git/info/exclude`
