# Tobira Releases and Versioning Policy

Tobira is released via [GitHub releases](https://github.com/elan-ev/tobira/releases).
Every release contains a pre-built binary for Linux-systems and a full changelog.

We currently only maintain one branch and thus only have one release track.
In other words: we don't backport bugfixes or other patches.
Only the latest version is officially supported.

Tobira version identifiers look like `x.y-name`, e.g. `3.12-cherry`.

- `x`: main version number. Is increased for releases that contain new features, major UI changes, or any other non-small change.
- `y`: patch version number. Is increased for releases that only contain bugfixes and other very minor changes. Reset to 0 whenever `x` is increased.
- `name`: an arbitrary nickname for this release. Is associated to `x` and changes if and only if `x` changes.

**Important**: the version identifier carries no semantic information you can rely on!
It is simply an identifier, that's easy to communicate and useful for "marketing".
The rules for increasing the numbers are deliberately very underspecified and  just very roughly approximate the user-perceived "size" of the release.
You must **not** rely on these numbers to derive any information about breaking changes or ease of updating.
**This is not SemVer!**

However, we do care a lot about providing you with all relevant information about breaking changes!
Every release mentions all potentially breaking changes in its changelog.
Additionally, there is a release overview with breaking changes [here](./releases.md).

<br>
<br>

---

## Breaking and non-breaking changes

Our definition of these terms for Tobira. Defines what we guarantee and what not.

### Breaking changes/stability guarantees

We consider the following changes as *breaking*, highlighting them in changelogs and tracking them in [the release overview](./releases.md).
The short tags at the beginning are the table column headers in said release overview.

- *config*: Changing the configuration file in a backwards-incompatible way.
- *auth*: Changing the auth-system in a backwards-incompatible way.
- *cli*: Changing the stabilized parts of the CLI in a backwards-incompatible way.
- *meili*: Requiring a new version of MeiliSearch.
- *pg*: Dropping support for a non-EOL version of PostgreSQL.
- *tmod*: Requiring a newer version of the Tobira module in Opencast.
- *ocversion*: Requiring a new Opencast version.
- *ocreq*: Adding new Opencast requirements (e.g. having static-file authorization disabled).


### Non-breaking changes

All changes not listed in the previous section are considered *non-breaking* by us.
We may release these changes at any time.
And while most will likely be mentioned in the changelog somewhere, some may not.

To name a few things explicitly (this is not a complete list!):

- Changing the configuration file in a backwards-compatible way (e.g. adding new fields with default values, allowing more values for an existing field, ...).
- Adding new non-required `x-tobira-*` headers to the auth system.
- Dropping support for an [EOL-version of PostgreSQL](https://www.postgresql.org/support/versioning/) (e.g. PostgreSQL 10 after Nov 10, 2022)
- Database schema changes: we always provide scripts to easily migrate the database.
  Tobira automatically runs the appropriate scripts when starting, so you don't have to do anything.
- Anything that requires a search index rebuild.
  These rebuilds will be performed automatically after updating Tobira and should be done within a few seconds (for tens of thousands of events/series).
- Any changes to the GraphQL API. **This API is internal and we will break it very regularly.**
- Any changes to emitted HTML, DOM nodes, CSS, and JS.
- Any user-facing changes, like adding features, removing features, changing features, change the design, ...


<br>
<br>

---

## Stabilized parts of Tobira

See the section "Breaking and non-breaking changes" for context.

### CLI (command line interface)

- `tobira serve`: starts the web server.
- `tobira worker`: runs forever syncing with Opencast and keeping the search index up to date.
- `tobira check`: checks for some potential problems with Tobira's configuration and environment.
  Will return a non-zero error code if some problem was found.
- `tobira sync run [--daemon]`
- `tobira search-index update [--daemon]`

And the `-c config-file` option for all these commands.


### The GraphQL API

Nothing is stabilized, everything may change.


### Emitted HTML, DOM-nodes, CSS, JS

Nothing is stabilized, everything may change.
