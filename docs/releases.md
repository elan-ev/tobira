# Tobira versions

(For context, please see our [versioning policy](./versioning-policy.md)!)

This document lists all Tobira releases with the kinds of breaking changes done in each release.
For the meaning of the columns, see the section "breaking changes" in the versioning policy.
The symbol 🔴 means that a breaking change of that kind happened in that release.
For columns that only track the required version of external software, the required version number is also listed.

(NOTE: these releases are dummy releases!)

| Release              | Date       | *config* | *auth* | *cli* | *meili*    | *pg* | *oc-version* | *oc-requirement* |
| -------------------- | ---------- | -------- | ------ | ----- | ---------- | ---- | ------------ | ---------------- |
| [2.1-bear]           | 2012-09-03 |          |        |       |    `^0.28` |  ≥10 |         12.0 |                  |
| [2.0-bear]           | 2012-09-01 |       🔴 |        |    🔴 |    `^0.28` |  ≥10 |      🔴 12.0 |                  |
| [1.2-antilope]       | 2012-08-18 |          |        |       | 🔴 `^0.28` |  ≥10 |         11.1 |                  |
| [1.1-antilope]       | 2012-07-22 |          |        |       |    `^0.27` |  ≥10 |         11.1 |                  |
| [1.0-antilope]       | 2012-07-10 |        - |      - |     - |    `^0.27` |  ≥10 |         11.1 |                - |


[2.1-bear]: https://github.com/elan-ev/tobira/releases/tag/2.1-bear
[2.0-bear]: https://github.com/elan-ev/tobira/releases/tag/2.0-bear
[1.2-antilope]: https://github.com/elan-ev/tobira/releases/tag/1.2-antilope
[1.1-antilope]: https://github.com/elan-ev/tobira/releases/tag/1.1-antilope
[1.0-antilope]: https://github.com/elan-ev/tobira/releases/tag/1.0-antilope
