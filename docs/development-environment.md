# Setup Development Environment

## Install Rust and stuff

You will need `rustc` and `cargo` to build the Tobira backend.
The recommended way to obtain Rust is via `rustup`, a compiler version manager.
Rustup also makes it very easy to install additional "components" (like `rustfmt` or a linter), to cross-compile and more.
You can install it [from here](https://rustup.rs/).
*However*, it should be no problem to install Rust from your package manager of choice, as long as the Rust version is somewhat recent.

## Local Database

The Tobira backend needs a postgres database.
For development, it's easiest to use Docker for this purpose.
You can probably just run the script `scripts/start-db.sh`, but below you can find information on how to do it manually.

You can create and immediately start a suitable docker container with this command:

```
docker run --name tobira-dev-postgres \
    -p 5435:5432 \
    -e POSTGRES_PASSWORD=tobira-dev-db-pw \
    -e POSTGRES_USER=tobira \
    -e POSTGRES_DB=tobira \
    -v tobira-dev-postgres:/var/lib/postgresql/data \
    -d \
    postgres
```

The Postgres database listens on port 5435 and persists all data into the docker volume `tobira-dev-postgres`.
All values in that command match the default Tobira configuration, so starting the backend without config file should just work.

Some other useful commands:
- `docker start tobira-dev-postgres` starts the container again after you rebooted (your host system) or shut it down manually.
- `docker stop tobira-dev-postgres` stops the container.
- `docker rm tobira-dev-postgres` removes the container completely.
- `docker volume rm tobira-dev-postgres` removes the volume that stores that actual data of the database.


### Populating the database

TODO
