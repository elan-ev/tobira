---
sidebar_position: 3
---


# Releases and Versioning Policy

Tobira is released via [GitHub releases](https://github.com/elan-ev/tobira/releases).

We only maintain one branch and thus only have one release track.
In other words: we don't backport bugfixes or other patches.
Only the latest version is officially supported.

Tobira version identifiers look like `x.y`, e.g. `3.12`.

- `x`: main version number. Is increased for releases that contain new features, major UI changes, or any other significant changes.
- `y`: patch version number. Is increased for releases that only contain bugfixes and other minor changes. Is reset to 0 whenever `x` is increased.

**Important**: the version is simply an identifier that's easy to communicate and useful for "marketing".
You must **not** rely on these numbers to derive any information about breaking changes or ease of updating.
**This is not SemVer!**

However, we do care a lot about providing you with all relevant information about breaking changes!
Every release mentions all potentially breaking changes in its release notes.

<br />
<br />

---

## Provided release binaries

We currently provide pre-built binaries for `x86_64-unknown-linux-gnu` and `x86_64-unknown-linux-musl`.
Both are supported and should work fine.

The `-gnu` build relies on dynamically linked libraries on your system.
We create that build on the oldest supported Ubuntu runner of GitHub actions, which is currently `20.04`.
Our release binary could require a glibc version up to the one on that runner, which is currently `2.31`.
In general, the dynamic library version requirements could change with any release.
If your server doesn't have those libraries, consider using the `-musl` build or [compiling Tobira yourself](./dev/build/release).

## Breaking and non-breaking changes

Our definition of these terms for Tobira. Defines what we guarantee and what we don't.

### Breaking changes/stability guarantees

We consider the following changes as *breaking*, highlighting them in changelogs.

- *config*: Changing the configuration file in a backwards-incompatible way.
- *auth*: Changing the auth-system in a backwards-incompatible way.
- *cli*: Changing the command line interface in a backwards-incompatible way.
- *meili*: Requiring a new version of MeiliSearch.
- *pg*: Dropping support for a non-EOL version of PostgreSQL.
- *oc-version*: Requiring a new Opencast version (often by requiring a newer version of the Tobira module).
- *oc-requirement*: Adding new Opencast requirements (e.g. having static-file authorization disabled).


### Non-breaking changes

All changes not listed in the previous section are considered *non-breaking* by us.
We may release these changes at any time.
To name a few things explicitly (this is not a complete list!):

- Any changes to the GraphQL API. **This API is internal and we will break it very regularly.**
- Any changes to emitted HTML, DOM nodes, CSS, and JS.
- Any user-facing changes, like adding/removing/changing features, changing the design, ...
- Database schema changes: we always provide scripts to easily migrate the database.
  Tobira automatically runs the appropriate scripts when starting, so you don't have to do anything.
- Anything that requires a search index rebuild.
  These rebuilds will be performed automatically after updating Tobira and should be done within a few seconds (for tens of thousands of events/series).
