# Deploy Tobira

## 1. Deploy binary

Get the appropriate `tobira-<target>` binary for your architecture from [our releases](https://github.com/elan-ev/tobira/releases) and copy it to your server.
You can place it anywhere you want, but we suggest creating a directory `/opt/tobira` and placing it there.
The rest of these docs also assumes that you rename it to just `tobira`, i.e. stripping the target suffix.

If you need to build your own binary, run `./x.sh build-release` at the top of the repository.
You will find the release artifacts in `deploy/`.
Also check [our build requirements](./build-requirements.md).


## 2. Setup PostgreSQL and MeiliSearch

As described in [the prerequisite docs](./run-requirements.md), Tobira needs a PostgreSQL DB and MeiliSearch.
How to setup those things is out of scope for these docs.


## 3. Setup reverse proxy

You likely want to put a reverse proxy in front of Tobira (e.g. `nginx`).
That reverse proxy will handle things like compression and authentication for you.


## 4. Setup authentication

See the [authentication docs](./auth) for more information on this part.


## 5. Configure Tobira & provide additional files

Tobira will check for `config.toml` (in the working directory) and `/etc/tobira/config.toml` and use the first one it finds.
You can set an explicit config path with the environment variable `TOBIRA_CONFIG_PATH` or the `-c` CLI flag.
If none of these is found, Tobira will exit with an error.
For all configuration options and their respective explanations, see [`config.toml`](./config.toml).
That file also serves as a good template to copy to your server and then adjust.

You usually have some additional files that Tobira needs access to (e.g. the logo).
All file paths you use in the configuration file are relative to the configuration file itself.

You can check the configuration file and all connections by running `tobira check`.


## 6. Run server and sync daemon

There are two main long running processes you want to run on your server:

- `tobira serve`: the web server
- `tobira worker`: run all regular tasks, like syncing with Opencast or keeping the search index up to date.

You likely want to setup services for those.
