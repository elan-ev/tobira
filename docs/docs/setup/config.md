---
sidebar_position: 4
---

import CodeBlock from '@theme/CodeBlock';
import ConfigSrc from '!!raw-loader!./config.toml';

# Configuration

Tobira will check for `config.toml` (in the working directory) and `/etc/tobira/config.toml` and use the first one it finds.
You can set an explicit config path with the environment variable `TOBIRA_CONFIG_PATH` or the `-c` CLI flag.
If none of these is found, Tobira will exit with an error.

You usually have some additional files that Tobira needs access to (e.g. the logo).
All file paths you use in the configuration file are relative to the configuration file itself.

The Tobira binary is able to emit a "configuration template", i.e. the empty structure of the config file without any values set, but with descriptions of all possible options.
It's a great starting point to configure your Tobira.
You can generate it with `./tobira write-config`, but that file is also attached to [each release](https://github.com/elan-ev/tobira/releases) as `config.toml`.
Or you can just copy it from below.

For configuring the `[theme]` section, see [the next chapter](./theme).

## Known roles

You can provide a mapping from role (e.g. `ROLE_STUDENT_MASTER`) to label (e.g. "M.Sc. Students").
This enables Tobira to show access rights (ACLs) in a more user-friendly way.
Unlike all other configurations, these known roles are not stored in `config.toml`, but in the database.
They are manipulated/configured via the CLI.
This was done to make it easier to modify them via scripts.

### Known groups

There are only three built-in known groups: `ROLE_ANONYMOUS` (everyone), `ROLE_USER` (logged in users) and `ROLE_ADMIN` (administrators).
To configure additional known non-user roles, these four commands exist:

- `tobira known-groups clear`: deletes all know groups (except the built-in ones).
- `tobira known-groups remove <role...>`: removes one or more known groups identified by their role.
- `tobira known-groups list`: lists all known groups (except built-in ones).
- `tobira known-groups upsert <groups.json>`: adds/updates the groups in the given JSON file.

Groups are specified in a JSON file in this format (`list` outputs the same format):

```json
{
    "ROLE_STUDENT": { "label": { "default": "Students", "de": "Studierende" }, "implies": [], "sortKey": "_c", "large": true },
    "ROLE_STAFF": { "label": { "default": "Staff", "de": "Angestellte" }, "implies": [], "large": true },
    "ROLE_LECTURER": { "label": { "default": "Lecturers", "de": "Vortragende" }, "implies": ["ROLE_STAFF"], "large": true },
    "ROLE_TOBIRA_MODERATOR": { "label": { "default": "Moderators", "de": "Moderierende" }, "implies": ["ROLE_STAFF"], "large": false }

    // You can also overwrite the label of built-in groups, if you so desire
    // "ROLE_USER": { "label": { "default": "...", "de": "..." }, "implies": [], "large": true },
}
```

Field explanation:

- `label`: a user-friendly label in different languages (identified by 2 letter language code).
- `implies`: lists roles that a user with the role in question always also has.
  Example: all lecturers are staff (always!).
  So all users with `ROLE_LECTURER` always also have the role `ROLE_STAFF`.
  This information is used to improve the user interaction with the ACL interface.
  All roles automatically imply `ROLE_USER` and `ROLE_ANONYMOUS`.
- `large`: set to `true` if this group is considered so large that giving write access to it is unusual enough to show a warning in the ACL interface.
  `ROLE_USER` and `ROLE_ANONYMOUS` are both considered large.
- `sortKey`: optional, used to sort entries in the group selector.
  Entries with same `sortKey` are sorted alphabetically.
  Entries without `sortKey` are sorted last.
  By default, `ROLE_ANONYMOUS` has sortKey "_a" and `ROLE_USER` has "_b".

Note that `upsert` is idempotent, so you can simply call this as part of your Ansible script, for example.


## All configuration options

This is the the configuration template described above:

<CodeBlock language="toml">{ConfigSrc}</CodeBlock>
