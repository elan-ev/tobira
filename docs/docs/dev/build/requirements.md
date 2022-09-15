---
sidebar_position: 1
---

# Requirements

Generally, Tobira assumes a Unix system to build on.
Making it compile on non-Unix should be fairly straight forward, but is not our priority at all.
If you are a Windows developer, WSL2 works nicely for Tobira development.

To build Tobira, you need:

- **Rust** (`rustc` and `cargo`): [install via `rustup`](https://www.rust-lang.org/tools/install) (preferred) or using your system's package manager. You'll need a recent Rust version as Tobira tracks the latest stable version.

- **Build essentials**: most importantly, a linker (`cc`). This is likely already installed on your system. If not, most package managers have a package for that, e.g. `build-essential` on Ubuntu/Debian-based.

- **NPM** ≥7: [official installation docs](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Usually part of the `node` package of your system's package manager (e.g. `nodejs` on Ubuntu/Debian-based).
