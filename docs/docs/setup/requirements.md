---
sidebar_position: 1
---

# Requirements

To run, Tobira requires:

- A Unix system.
- A **PostgreSQL** (≥14) database (see below for further requirements).
- [**Meilisearch**](https://www.meilisearch.com/) (≥ v1.12). For installation, see [Meili's docs](https://docs.meilisearch.com/learn/getting_started/quick_start.html#step-1-setup-and-installation).
- An **Opencast** that satisfies certain condition. See below.


(If you are a developer, check the `util` folder!)

## Further PostgreSQL requirements

These are technicalities that you likely don't need to care about if you have a dedicated and modern PostgreSQL for Tobira.

- Over the lifetime of a Tobira installation the `current_schema()` must not change.
- Tobira assumes exclusive control over the `current_schema()`.
  So don't let other applications use the same schema.
  You should also not add/modify/remove any data or objects in the schema manually.

## What Tobira requires of Opencast

Tobira doesn't work with any Opencast instance out of the box.
There are some requirements.

- **Version**: 
  Tobira can in principle work with Opencast as far back as 12.3, but some features don't work in that case.
  By default, Tobira uses ED25519 JWT signatures, which Opencast only supports since version 19. 
  Tobira can be reconfigured to use a different JWT to support older Opencast versions, though.

- Opencast needs to accept JWTs created by Tobira.
  See [this document](./auth/jwt) for more information.

- Opencast needs to allow cross origin requests from Tobira.
  Otherwise, things like the video uploader don't work.

- We assume that everyone who has `write` access to something also has `read`
  access. We often don't check the roles allowed to read if we already checked
  the roles allowed to write.

- If you don't have an SSO solution, you need to configure the Opencast redirect endpoint in such a way that
  all users with access to Studio and/or the Editor can use it, and so that the URLs to these services
  are added to the appropriate allow-list.
