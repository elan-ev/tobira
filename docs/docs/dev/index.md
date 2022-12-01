---
sidebar_position: 6
---

# Development

:::info
For the developer-targeted docs, make sure to use the "Next" version of these docs instead of the ones from the last release.
See the version selector on the top right.
:::

This part of the documentation is targeted at developers who want to work on Tobira.
It also contains useful information about how to manually build Tobira.
If you are only interested in getting Tobira up and running with the officially released binaries, you can likely ignore all of this.


## Quick start

```shell
./x.sh containers start
./x.sh start
```

And then open <http://localhost:8030/>.

The first command starts a bunch of docker containers that Tobira needs.
The second command downloads all dependencies, builds the backend and frontend, starts a development server, and rebuilds everything on file changes.
