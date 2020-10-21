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
# build and run
cargo run
```

Configuration
-------------

The backend loads configuration from `config.toml` in the current working directory.

```toml
# Database configuration
[db]

# Database user
# Default: tobira
user = "tobira"

# Database password
# Default: tobira-dev-db-pw
password = "tobira-dev-db-pw"

# Database host
# Default: 127.0.0.1
host = "127.0.0.1"

# Database port
# Default: 5432
port = 5432

# Database name
# Default: tobira
database = "tobira"
```
