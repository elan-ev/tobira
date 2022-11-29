# Tobira's documentation

[**Hosted documentation**](https://elan-ev.github.io/tobira)

This directory contains Tobira's documentation, which is rendered with [Docusaurus](https://docusaurus.io/).
The docs are hosted with GitHub pages at the location linked above.
The actual docs live in `./docs`.

To render the docs, run (in this directory): `npm ci` and `npm start`.

Versioned docs (as can be seen in our public docs) can be set up with `util/scripts/build-versioned-docs.sh`.
See that script for more information.
But usually you don't need to set that up and only render the latest version, which is done by default.

The file `versions.txt` is used by `build-versioned-docs.sh` and lists all versions that should be included.
The newest version should be at the top.
