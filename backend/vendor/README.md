# Vendored dependencies

For the backend, we mainly use crates.io dependencies, which can be considered immutable.
Sometimes, we send patches to some of those libraries, which we want to use in Tobira before they are merged/published.
We could use Cargo git-dependencies, but this is problematic for reproducible builds, especially when a fork might be deleted in the future.
In those cases, we vendor these dependencies.
But this is always just temporary and we always want to switch to upstream versions of these dependencies ASAP.

We also document the exact version used in vendored dependencies in this document:

## `meilisearch-sdk`

Base is `40f94024cda09a90b2784121d3237585c7eb8513` with these two PRs applied on top:
- https://github.com/meilisearch/meilisearch-rust/pull/625 (head `40518902db64436778dee233125ebccc9b442bad`)
- https://github.com/meilisearch/meilisearch-rust/pull/632 (head `737b519ddc10561bb4905c706f7b1a8d6d509857`)

I removed `examples/`, `.git`, `Cargo.lock` (not used anyway if used as library) and a bunch of Rust-unrelated files to shrink the size of this.
