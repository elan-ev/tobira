---
sidebar_position: 4
---

# Database and test data

## DB management, migrations and more

The `tobira db` subcommand (usually via `cargo run -- db`) contains a number of useful tools to manage the database.
Run `db --help` to find out more.

Whenever you change existing DB migrations, Tobira won't start.
You can fix that by either purging the DB and rerunning all migrations, but that obviously also deletes your all data.
You can do that with `cargo run -- db reset`.
Another option for when the migration change doesn't actually change anything in the DB (e.g. a comment change), is to use `cargo run -- db unsafe-overwrite-migrations`.


## Test data

A freshly started Tobira instance doesn't have any data in it.
The repository provides some dummy data that you can use.
We are mainly talking about *video data* (event & series from Opencast) and *realm data* (page structure).

You can use `util/fixtures.sql` to get both kinds of data into the development database:

```shell
# in `backend` folder
cargo run -- db script ../util/fixtures.sql
```

To import video data, you can also sync with an Opencast instance that has the Tobira module enabled (e.g. `develop.opencast.org`).
To do this, create a copy of `util/dev-config/config.toml` and call it `util/dev-config/sync-config.toml`.
Change the sync section in that file to contain the correct credentials for your Opencast instance.
Then run `cargo run -- sync run -c ../util/dev-config/sync-config.toml`.

To just import realm data, you can use the `import-realm-tree` subcommand and pass it a fitting YAML file.
This repository contains `.deployment/files/realms.yaml` (big) and `util/dummy-realms.yaml` (small).
Import those with `cargo run -- import-realm-tree ../util/dummy-realms.yaml`.
