# Tobira: an Opencast Video Portal

![CI Status (master)](https://img.shields.io/github/workflow/status/elan-ev/tobira/CI/master)
![License](https://img.shields.io/github/license/elan-ev/tobira)
![Status: alpha](https://img.shields.io/badge/status-alpha-red)

__The project is in its *very* early stages, there is nothing to see here yet.__

## Structure

Tobira consists of two parts:

- `backend` contains the video portal backend written in Rust which takes care of data persistence and communication to Opencast.
- `frontend` contains the web interface written in Typescript/React.


## How to build Tobira

### Install Development Dependencies

You will need `rustc` and `cargo` to build the Tobira backend.
To get them, use [`rustup`](https://rustup.rs) or your package manager.

You will need NPM to build the frontend.


### Local Database

To run Tobira, you need a PostgreSQL database.
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


### Building

For building a production version of Tobira once, check out these documents:

- [Building the backend](backend/README.md)
- [Building the frontend](frontend/README.md)

If you plan to do development on Tobira, you probably don't want to execute all commands manually each time.
Instead, you can use [the tool `floof`](https://github.com/LukasKalbertodt/floof) with the configuration file `floof.yaml` provided in this repository.
This will watch all files, recompile/build whenever a file changes and provide a dev server that automatically reloads the page in your browser.

Once you installed `floof`, just run `floof` at the root of this repository.
You might want to modify `floof.yaml` to better fit your development workflows:

- Make a copy: `cp floof.yaml floofy.yaml`
- Tell git to ignore your copy: `echo "/floofy.yaml" >> .git/info/exclude`
- Run `floof -c floofy.yaml`
