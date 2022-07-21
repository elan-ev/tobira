# Tobira Releases and Versioning Policy

Tobira is released via [GitHub releases](https://github.com/elan-ev/tobira/releases).

We only maintain one branch and thus only have one release track.
In other words: we don't backport bugfixes or other patches.
Only the latest version is officially supported.

Tobira version identifiers look like `x.y-name`, e.g. `3.12-cherry`.

- `x`: main version number. Is increased for releases that contain new features, major UI changes, or any other significant change.
- `y`: patch version number. Is increased for releases that only contain bugfixes and other minor changes. Reset to 0 whenever `x` is increased.
- `name`: an arbitrary nickname for this release. Is associated to `x` and changes if and only if `x` changes.

**Important**: the version is simply an identifier that's easy to communicate and useful for "marketing".
You must **not** rely on these numbers to derive any information about breaking changes or ease of updating.
**This is not SemVer!**

However, we do care a lot about providing you with all relevant information about breaking changes!
Every release mentions all potentially breaking changes in its changelog.
Additionally, we maintain [a release overview, marking breaking changes](./releases.md).

<br>
<br>

---

## Breaking and non-breaking changes

Our definition of these terms for Tobira. Defines what we guarantee and what we don't.

### Breaking changes/stability guarantees

We consider the following changes as *breaking*, highlighting them in changelogs and tracking them in [the release overview](./releases.md).
The short tags at the beginning are the table column headers in said release overview.

- *config*: Changing the configuration file in a backwards-incompatible way.
- *auth*: Changing the auth-system in a backwards-incompatible way.
- *cli*: Changing the stable parts of the CLI in a backwards-incompatible way (see below).
- *meili*: Requiring a new version of MeiliSearch.
- *pg*: Dropping support for a non-EOL version of PostgreSQL.
- *oc-version*: Requiring a new Opencast version (often by requiring a newer version of the Tobira module).
- *oc-requirement*: Adding new Opencast requirements (e.g. having static-file authorization disabled).


### Non-breaking changes

All changes not listed in the previous section are considered *non-breaking* by us.
We may release these changes at any time.
And while most will likely be mentioned in the changelog somewhere, some may not.

To name a few things explicitly (this is not a complete list!):

- Any changes to the GraphQL API. **This API is internal and we will break it very regularly.**
- Any changes to emitted HTML, DOM nodes, CSS, and JS.
- Any user-facing changes, like adding features, removing features, changing features, change the design, ...
- Database schema changes: we always provide scripts to easily migrate the database.
  Tobira automatically runs the appropriate scripts when starting, so you don't have to do anything.
- Anything that requires a search index rebuild.
  These rebuilds will be performed automatically after updating Tobira and should be done within a few seconds (for tens of thousands of events/series).


<br>
<br>


### Stable parts of the CLI (command line interface)

The following commands/flags are considered stable and changing them will include a "breaking change" mention in the changelog.

- `tobira serve`
- `tobira worker`
- `tobira check`
- `tobira sync run [--daemon]`
- `tobira search-index update [--daemon]`
- `-c config-file` for all above commands
