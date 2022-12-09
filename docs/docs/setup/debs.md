---
sidebar_position: 3
---

# Tobira Debian Packages

The Tobira Debian packages support currently maintained Debian based releases.
This guide also assumes that you have the appropriate Debian repositories installed on your server.
Find these documents in the adopter documentation in [Opencast's documentation](https://docs.opencast.org/).


## 1. Install Tobira Dependencies

As described in [the requirements docs](./requirements), Tobira needs a PostgreSQL DB and [MeiliSearch](https://www.meilisearch.com/).
How to setup those things is out of scope for these docs.
This guide also assumes Opencast is already set up correctly.

## 2. Install Tobira

Install Tobira with `apt-get install tobira` to get the latest version.
If you need a specific version, (example here is 1.3), use `apt-get install tobira=1.3-1`.
These packages are just a thin wrapper around the binaries you would otherwise deploy manually, with the sole exception of setting up a log file in `/var/log/tobira`.

## 3. Return to the Deploy documentation

Go back to the [deploy documentation](deploy.md#3-setup-reverse-proxy)
