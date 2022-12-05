---
sidebar_position: 4
---

# Database and test data

## DB management, migrations and more

The `tobira db` subcommand (usually via `cargo run -- db`) contains a number of useful tools to manage the database.
Run `db --help` to find out more.

Whenever you change existing DB migrations, Tobira won't start.
You can fix that by either purging the DB and rerunning all migrations, but that obviously also deletes all your data.
You can do that with `cargo run -- db reset`.
Another option for when the migration change doesn't actually change anything in the DB (e.g. a comment change), is to use `cargo run -- db unsafe-overwrite-migrations`.


## Test data

A freshly started Tobira instance doesn't have any data in it.
We provide some dummy data that you can use for development.


### Big dataset (recommended)

Run the following command, which downloads a roughly 3MB DB dump and imports it into your dev DB.
This is roughly the same data you can see on [tobira.opencast.org](https://tobira.opencast.org).

```shell
./x.sh db load-dump
```
:::tip
We recommend always working with the dataset that is closest to production use cases and thus also contains messy real world data.
That way, you immediately notice problems which you might not catch on a tiny dataset with polished data.
These problems range from DB query performance to UI design.
:::

### Tiny dataset

In `backend/` run this:

```shell
cargo run -- db script ../util/fixtures.sql
```

### Your own Opencast data

First, sync video/series data:
- `cp util/dev-config/config.toml util/dev-config/sync-config.toml`
- Change the sync section of the new file to contain the correct credentials for your Opencast instance.
- In `backend/`, run `cargo run -- sync run -c ../util/dev-config/sync-config.toml`


To get some realms (pages), either manually create some or import a file containing dummy realms.
To import, run this in `backend/`: `cargo run -- import-realm-tree <file>`.
`<file>` is `.deployment/files/realms.yaml` (big) or `util/dummy-realms.yaml` (small).
You might want to pass `--dummy-blocks` as well.
