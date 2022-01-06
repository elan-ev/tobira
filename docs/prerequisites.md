# Prerequisites for building and running Tobira

Generally, Tobira assumes a Unix system to build and run on.
Making it compile and run on non-Unix should be fairly straight forward, but is not our priority at all.
If you are a Windows developer, WSL2 works nicely for Tobira development.


## Build requirements

- **Rust** (`rustc` and `cargo`): [install via `rustup`](https://www.rust-lang.org/learn/get-started) (preferred) or using your system's package manager. You'll need a recent Rust version as Tobira tracks the latest stable version.
- **Build essentials**: most importantly, a linker (`cc`). This is likely already installed on your system. If not, most package managers have a package for that, e.g. `build-essential` on Ubuntu/Debian-based.
- **NPM** ≥7: [official installation docs](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Usually part of the `node` package of your system's package manager (e.g. `nodejs` on Ubuntu/Debian-based).

Additionally, if you are a developer (planning to work on Tobira), you might want to install [`floof`](https://github.com/LukasKalbertodt/floof) to enable automatic recompilation and a dev server with auto-reload: `cargo install floof`.


## Run requirements

The only thing Tobira requires is a PostgreSQL (≥10) database.

If you are a developer and just need a PostgeSQL database for development, you can use the `docker-compose` script in [the `scripts` folder](../scripts). For that, you have to install docker-compose (or an equivalent tool like Podman) and then run `docker-compose up -d` in the `scripts` folder. As a (production) user of Tobira, you should setup your own PostgreSQL DB and not use our script.

Tobira also requires certain things from your Opencast installation.
See [this document](./opencast-requirements.md).
