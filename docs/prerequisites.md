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

To run, Tobira requires:

- A PostgreSQL (≥10) database. For PostgreSQL version 12 and older, you have to manually enable the `pgcrypto` extension!

- [Meilisearch](https://www.meilisearch.com/). TODO: exact requirements still unclear.

- Certain things from your Opencast installation. See [this document](./opencast-requirements.md) for more information.


If you are a developer, checkout the `scripts` folder!

