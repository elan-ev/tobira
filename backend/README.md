Tobira Backend
==============

GraphQL Schema
--------------

Export the GraphQL schema of the API.
The frontend needs this.

```sh
cargo run --bin export-schema -- ../frontend/src/schema.graphql
```


Building the Backend
--------------------

Use [Cargo](https://doc.rust-lang.org/cargo/getting-started/first-steps.html) to build the backend.
This needs the frontend to be built.

```sh
# build only
cargo build
# build and start backend server
cargo run -- serve
```

Configuration
-------------

The backend loads its configuration from the first file found at the following locations:
- `config.toml`
- `/etc/tobira/config.toml`
To generate an example configuration file with further documentation, run:

```sh
tobira write-config               # write to stdout
tobira write-config config.toml   # write to 'config.toml'
```
