# Setup Development Environment

## Install Rust and stuff

TODO


## Local Database

The Portal backend needs a postgres database.
For development, it's easiest to use Docker for this purpose.
You can probably just run the script `scripts/start-db.sh`, but below you can find information on how to do it manually.

You can create and immediately start a suitable docker container with this command:

```
docker run --name portal-dev-postgres \
    -p 5435:5432 \
    -e POSTGRES_PASSWORD=portal-dev-db-pw \
    -e POSTGRES_USER=portal \
    -e POSTGRES_DB=portal \
    -v portal-dev-postgres:/var/lib/postgresql/data \
    -d \
    postgres
```

The Postgres database listens on port 5435 and persists all data into the docker volume `portal-dev-postgres`.
All values in that command match the default Portal configuration, so starting the backend without config file should just work.

Some other useful commands:
- `docker start portal-dev-postgres` starts the container again after you rebooted (your host system) or shut it down manually.
- `docker stop portal-dev-postgres` stops the container.
- `docker rm portal-dev-postgres` removes the container completely.
- `docker volume rm portal-dev-postgres` removes the volume that stores that actual data of the database.


### Populating the database

TODO
