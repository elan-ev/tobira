# Project Overview for Developers

This document provides an overview over the project structure and code.
It is aimed at developers interested in hacking on Tobira.
Be sure to also read [the docs about building Tobira for development](./dev-workflow.md).

Tobira consists of a frontend, written in Typescript, and a backend, written in Rust.
These two communicate via a GraphQL API.
The final output of building Tobira is a single executable that can be deployed to a server and starts listening for incoming HTTP traffic.
This executable also embeds/contains all assets (e.g. JavaScript files).


## Frontend

The frontend is written in TypeScript and uses React as UI-framework.
You should at least be somewhat familiar with both of these to work on this part of Tobira.

The entry point is `index.tsx` which renders the `App` component (`App.tsx`) as root node.
`App` itself does not render anything visible directly, but just sets up several contexts and renders the `Router` and the `ActiveRoute`.
We use our own router (defined in `router.tsx`) as it's not terribly hard to do and because it allows us to use some advantages of Relay, our GraphQL framework.
The `ROUTES` constant in `router.tsx` defines all routes in the application (which are matched from top to bottom).

The routes themselves are defined inside `routes/`.
Most of these use the `Root` component (`layout/Root.tsx`) to render.
This component provides the main layout of the whole page (i.e. header, footer, burger menu, ...) and renders other components defined in `layout/`.
Additionally:

- `i18n/`: sets up and defines all translation strings. We use `i18next`.
- `relay/`: Relay/GraphQL related setup and error handling.
- `typings/`: TypeScript types for libraries that do not provide their own.
- `ui/`: several (somewhat) reusable components used by the routes.
- `util/`: several utilities.

Another thing worth mentioning is that the backend embeds the frontend configuration into the HTML data as a JSON object.
Compare `index.html` and `config.ts`.
The weird template-looking things in `index.html` are from `reinda`, the asset management library of the backend.

Some additional notes:

- CSS is done via `emotion-js`:
  you can pass an object to the `css` prop of components, which describe CSS-declarations.
  Emotion then generates appropriate class names and everything else.
  This has the big advantage that CSS can depend on React props and state.

- Almost all of our React components are defined as functional component and are using hooks extensively.

- We use Relay for our GraphQL handling which gives us a few advantages.
  Note that fragments should be used a lot such that, in general, there should only be one query per route.


## Backend

The backend is written in Rust and uses the following libraries:

- `hyper` as HTTP-server
- `tokio` as async framework
- `juniper` as GraphQL-framework
- `confique` for configuration management
- `postgres` to communicate with the PostgreSQL DB
- `structopt` for CLI argument parsing
- `reinda`: asset management and embedding

The backend lives in three separate crates (`api`, `server` and `util`), but this might change in the future.
The `server` crate is the main crate and compiles to an executable, while the `api` and `util` crates are libraries that define the GraphQL API and some utilities respectively.
The Tobira executable expects CLI arguments and in particular: a subcommand.
`tobira serve` starts the HTTP server, `tobira sync` synchronizes with Opencast, `tobira db` provides DB utilities, and so on.
Here, `tobira` stands for the executable which is created at `backend/target/<mode>/tobira` where `<mode>` can be `release` or `debug`.
You would usually run this executable with `cargo run`.
To pass CLI args to Tobira (instead of cargo), list Tobira args after a double dash `--` that is surrounded by spaces, e.g. `cargo run -- serve`.

The main entry point is `main.rs` where CLI args are parsed and the correct function, according to the subcommand, is called.
The CLI args itself are defined in `args.rs` as multiple types with the `derive(StructOpt)` attribute.
The HTTP server stuff is defined in `http/` where the hyper server is configured and started.
The `sync/` folder is about everything for the `sync` subcommand: communicating with Opencast.

In `db/`, everything about DB handling is defined, including migrations, the table-definitions and the `db` subcommands.
We have our own migration logic with an ordered list of migrations, currently all written in SQL (inside `db/migrations/`).
These are applied to an empty database in order.
We also store the name of the migration and its full script in a meta database table.
This allows us to keep track of which migrations are already applied to a specific DB, allowing for (hopefully) easy updates.
In many cases, migrations are automatically applied if they are missing.
However, if any migrations have changed (compared to the applied migrations in the DB), Tobira cannot know what best to do.
In that case, Tobira refuses to start and you have to figure out and fix the DB situation yourself.
For developers (think: no important data in the DB) you can usually call `tobira db reset`.

For the API, the main entry points are `query.rs` and `mutation.rs`.
Relay (in the frontend) requires us to have globally unique IDs for all nodes in our API.
To achieve that we define our own `Id` type (`id.rs`) that consists of an 2-character type tag (which is different for each kind of node, e.g. realm, event, ...) and a base64 encoded 64 bit integer.
That integer directly corresponds to the IDs in the database.
