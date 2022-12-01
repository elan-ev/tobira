---
sidebar_position: 3
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

## All configuration options

This is the the configuration template described above:

<CodeBlock language="toml">{ConfigSrc}</CodeBlock>
