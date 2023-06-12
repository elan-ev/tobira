---
sidebar_position: 7
---

# Update Tobira

Updating Tobira is super simple in theory:
replace the old binary with the new one and restart the processes.
But due to breaking changes and other reasons, there are a few things to look out for.

*Note*: this document is fairly long, but only to cover lots of cases that rarely occur.
Usually, you can skip most of this.


## Preparation

Read the release notes of all releases between your current Tobira version and the one you want to update to.
Most importantly, check all [breaking changes](../versioning-policy) and act upon those as required.
**Reminder**: the version labels are purely cosmetic and minor version bumps can have breaking changes!

Deal with some of the possible breaking changes:
- Update your Opencast to a version that will also work with the new Tobira.
- Make sure your Opencast satisfies all requirements of the new Tobira.
- Update your PostgreSQL to a version compatible with the new Tobira.
- Adjust your authentication integration if Tobira's auth system changed.

:::caution
Now is a good time to perform a database backup.
Of course, database backups are already created automatically regularly, right?
*Right?*
:::


## Make changes

- **Replace the old Tobira binary by the new one**
- **Update `config.toml`**
    - We recommend doing this regardless of whether there was a breaking configuration change:
      it makes sure the config file stays as close to the upstream one as possible, making future updates easier.
    - *Note*: Tobira does not watch nor automatically reload the config file on change.
      Thus, you can change the file in place: it only takes effect once you restart the process.
- *Conditional*: if required, update other files referenced by `config.toml`.
- *Conditional*: if there were breaking Tobira CLI changes, update service files, scripts and other places as required.

<details>
<summary>Best way to update <code>config.toml</code>: <i>3-way merge</i></summary>

There are multiple 3-way merge tools you can use.
For example, when updating from v1.3 to v1.4:

- "base" is the original `config.toml` for v1.3 (attached to the release).
- "left" is the original `config.toml` for v1.4 (attached to the release).
- "right" is your current `config.toml` that's deployed on the server.

</details>

## *Conditional*: Update MeiliSearch

If Tobira requires a new MeiliSearch version, update that.

*Note*: when stopping the MeiliSearch process, Tobira's search functionality immediately ceases to work.
How to best proceed depends on whether the old Tobira also works with the new MeiliSearch:
- If it does work (e.g. updating MeiliSearch `1.x` to `1.y`): perform the Meili update before restarting Tobira to reduce search down-time.
- If it does *not* work: you can chose whether to update Meili before or after Tobira – you will have search down-time in any case, unfortunately.

:::info
All data in MeiliSearch can be rebuild quickly from the database.
Thus, exporting an index dump, as described in the official Meili docs, is not worth it.
`tobira worker` will automatically (re)build the search index on startup if necessary.
It can also manually be done via `tobira search-index rebuild`.
:::

To update Meili:

1. Update Meili as appropriate for your original installation method (e.g. replace binary, or update package).
1. Remove the Meili data directory (e.g. `/opt/meili/data.ms` or `/var/lib/meilisearch/data.ms`).
    - Assuming your Meili only contains Tobira data!
1. Start the new Meili version.

## Restart

1. **Run `tobira check`**:
    This makes sure the config is valid and performs a number of other checks.
    This lets you fix problems before stopping the running process.
1. **Restart processes**: The big moment! Everything should work now 🤞
1. **Make sure**:
    - ... that the new version is running by visiting `/~tobira`.
    - ... that the home page works.
    - ... that videos can be played.
    - ... that search works.

:::note
If you encounter a problem only when restarting the processes and you think it should have been caught by `tobira check`, let us know so that we can add that check!
:::

## Afterwards

- *Conditional*: if necessary, run a [resync](./resync).
