# Tobira: an Opencast Video Portal

__The project is in its *very* early stages, there is nothing to see here yet.__

## Structure

Tobira consists of two parts:

- `backend` contains the video portal backend written in Rust which takes care of data persistence and communication to Opencast.
- `frontend` contains the web interface written in Typescript/React.


## Install Development Dependencies

You will need `rustc` and `cargo` to build the Tobira backend.
To get them, use [`rustup`](https://rustup.rs) or your package manager.

You will need NPM to build the frontend.


## Local Database

Tobira needs a PostgreSQL database.
You can easily launch a database using docker-compose:

```sh
cd scripts
docker-compose up -d
```

To shut down the container again:
```sh
cd scripts
docker-compose down
```


### Building Front- and Backend

- [Building the backend](backend/README.md)
- [Building the frontend](frontend/README.md)


---

### License

Licensed under <a href="LICENSE">Apache License, Version 2.0</a>.
Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
