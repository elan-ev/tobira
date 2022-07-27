# Development workflow (compiling/building/testing)

**TL;DR: Run `./x.sh start`**.

Some software is required to build Tobira. See [this document](./build-requirements.md) for more information.

Unfortunately, the build process is a bit involved.
**We recommend using our script `x.sh`** which handles most of that complexity for you.
In particular, with `./x.sh start` you get auto-rebuilds and browser-reloads whenever you change any file.
Simply running `./x.sh` shows you the available commands/scripts.


## Using `x.sh` (recommended)

Ideally you want to use `./x.sh start`, but for that you need to install a few tools.
Run `./x.sh check-system` to see what you are still missing and how to install those.

After you installed all tools, **simply run `./x.sh start`**.
This will compile everything and watch for file changes to recompile and reload your browser sessions.
Note that the first build can take a while.
This also starts a dev server, which you want to use to access Tobira: http://127.0.0.1:8030.
You want to open that URL in your browser during development.

Frontend rebuilds are fairly quick, backend ones can take up to 15s.
Once the relevant component has been rebuilt, all browser sessions of Tobira are automatically reloaded.


## Using `mold` as linker to improve incremental build times

You can use [the `mold` linker](https://github.com/rui314/mold) to substantially reduce backend build times for incremental builds (i.e. when you compiled the backend once already).
Install mold, then create the file `backend/.cargo/config.toml` and fill it with this:

```toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=/path/to/mold"]
```

Where `/path/to/mold` is likely `/usr/local/bin/mold` (check `which mold`!).

## Test data

A freshly started Tobira instance has no data in it.
This repository provides some dummy data that you can use.
We are mainly talking about *video data* (event & series from Opencast) and *realm data* (page structure).

You can use `util/fixtures.sql` to get both kinds of data into the development database:

```sh
# in `backend` folder
cargo run -- db script ../util/fixtures.sql
```

To import video data, you can also sync with an Opencast instance that has the Tobira module enabled (there is currently no public one, sorry).
To do this, create a copy of `util/dev-config/config.toml` and call it `util/dev-config/sync-config.toml`.
Change the sync section in that file to contain the correct credentials for your Opencast instance.
Then run `cargo run -- sync run -c ../util/dev-config/sync-config.toml`.

To just import realm data, you can use the `import-realm-tree` subcommand and pass it a fitting YAML file.
This repository contains `.deployment/files/realms.yaml` (big) and `util/dummy-realms.yaml` (small).
Import those with `cargo run -- import-realm-tree ../util/dummy-realms.yaml`.


## DB management, migrations and more

Whenever you change existing DB migrations, you usually want to purge the DB and rerun all migrations.
You can do that with `cargo run -- db reset`.

The `db` subcommand of Tobira offers a few useful commands.
See `cargo run -- db --help` for more information.


## IDE/editor/dev environment

We recommend using TypeScript and Rust language servers to ease development a lot.
For Rust, use [`rust-analyzer`](https://rust-analyzer.github.io/) as it provides the best dev experience currently.
Language servers can be used in a large number of editors.
If you cannot decide, try Visual Studio Code, which provides a particularly high quality integration of language servers.
For Rust, [the IntelliJ plugin](https://intellij-rust.github.io/) is apparently also pretty good.


## Building manually

This section describes the knowledge encoded in `x.sh` and other scripts.
If you use these scripts, you do not really care about this section.


### Export GraphQL Schema

The GraphQL API is defined in Rust code inside `backend/src`.
The frontend requires a `schema.graphql` file to validate and compile all queries against.
This file is `frontend/src/schema.graphql` and should always match the Rust code defining the API (don't worry, our CI will make sure they match).

Whenever you change the API code in a way that alters the GraphQL schema, you have to update the schema file in the frontend with this command (in the `backend` folder):

```sh
cargo run -- export-api-schema ../frontend/src/schema.graphql
```

You also need to run the Relay compiler again (see next step).


### Check and build the frontend

(In the `frontend` folder)

As a first step, you need to download all required dependencies:

```sh
npm ci
```

Next, and whenever you change the GraphQL Schema or any GraphQL queries/fragments, you need to run the Relay compiler:

```sh
npx relay-compiler
```

Finally, and whenever you change frontend code, you need to:

- Type-check with TypeScript: `npm run typecheck`
- Lint with ESLint: `npm run lint`
- Build a new bundle with Webpack: `npm run build:dev`

However, due to our Webpack configuration, ESLint and TypeScript are already used during a normal Webpack invocation, so the last of these three commands is sufficient.


#### Watching

If you want to automatically rebuild on file changes, you can run these two commands in different terminal sessions:

```sh
npx webpack watch --mode=development --no-stats    # includes TypeScript and ESLint
npx relay-compiler --watch
```

This gives you the fastest rebuilds.
In rare cases, some caching problems occur and you need to restart these commands to get rid of outdated errors.
Note: `relay-compiler --watch` requires `watchman` to be installed!


### Building the backend

Usually, you can just run the following command in the `backend` folder whenever you change any backend code:

```sh
cargo run -- serve       # the `serve` parameter is passed to Tobira
```

This rebuilds (if necessary) and then starts the Tobira server.

In debug mode, the frontend files are dynamically loaded from `../frontend/build`.
If you build in release mode (`--release`), the frontend files are embedded into the resulting binary, meaning that they have to be present during backend compilation!
