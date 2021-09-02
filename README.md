# Tobira: an Opencast Video Portal

![CI Status](https://github.com/elan-ev/tobira/workflows/CI/badge.svg)
![License](https://img.shields.io/github/license/elan-ev/tobira)
![Status: alpha](https://img.shields.io/badge/status-alpha-red)

__The project is in its very early stages. While the text below uses present-tense, by far not everything is implemented yet!__

Tobira is a video portal for [Opencast](https://opencast.org).
It provides a hierarchical page structure, with each page consisting of simple configurable content blocks (e.g. text or video list).
Opencast content (series or single events) can be embedded on these pages.
Users also have their own personal page and can upload, edit and share their own videos.

The current version of our main branch is deployed at https://tobira.opencast.org.
This is just a test deployment and all data is wiped whenever it is re-deployed.
The test data was kindly provided by the ETH only for the purpose of this test deployment.

## Documentation

The documentation mainly resides inside the `docs/` folder in this repository.
For an overview of Tobira's architecture, see [Tobira high level overview](./docs/overview.md).
If you want to use Tobira on your server, see [Building Tobira](./docs/build-release.md) and [Deploying Tobira](./docs/deploy.md).

If you are a developer and want to work on Tobira, check out [`CONTRIBUTING.md`](./docs/CONTRIBUTING.md), [the development workflow](./docs/dev-workflow.md) and [the project overview for devs](./docs/dev-overview.md).

### Name

*Tobira* (扉) is Japanese  for "door", "hinged door" or "front page" (of a book).
A video *portal* is a kind of door, so we chose that name.
It is also short and somewhat pronounceable for English speaking people.

