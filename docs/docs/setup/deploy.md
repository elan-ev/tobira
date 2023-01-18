---
sidebar_position: 2
---

# Deploy Tobira

This is an overview of what you need to do in order to deploy Tobira.


## 1. Setup Opencast, PostgreSQL and MeiliSearch

As described in [the requirements docs](./requirements), Tobira needs a PostgreSQL DB and [MeiliSearch](https://www.meilisearch.com/).
How to setup those things is out of scope for these docs.
This guide also assumes Opencast is already set up accordingly.


## 2. Install Tobira

See ["Installation methods"](./install).


## 3. Setup reverse proxy

You have to put a reverse proxy in front of Tobira (e.g. `nginx`).
It will handle HTTPS, authentification, compression, and other things for you.
The authentification setup is described below.


## 4. Configure Tobira & provide additional files

See [the configuration docs](./config).
You can usually just grab the "configuration template" (e.g. the `config.toml` attached to each release) and go through it, setting all values appropriately.
A few additional notes and tips about that:

- Most values are optional and don't need to be adjusted for most use cases.
- Don't touch any `auth.*` values for now. Authentication is handled in the next step.
    - Except for `auth.jwt.*`: See [Setup JWT auth](./auth/jwt) for that.
- You can check the configuration file and all connections by running `tobira check`.


## 5. Setup authentication

Depending on your requirement this is likely the most time-consuming step.
See the [authentication docs](./auth) for more information on this part.


## 6. Run server and sync daemon

There are two main long running processes you want to run on your server:

- `tobira serve`: the web server
- `tobira worker`: run all regular tasks, like syncing with Opencast or keeping the search index up to date. There should only be one worker process per database (i.e. usually only one in total).

You likely want to setup services for those.
