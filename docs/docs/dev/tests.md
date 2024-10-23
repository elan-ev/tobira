---
sidebar_position: 8
---

# Tests

Tobira comes with various different automated tests to prevent bugs or unintended changes.
These are all automatically run by our GitHub-based continious integration (CI) for every pull request.
But it is also useful to run the tests locally, for example to add new tests.


## Backend & DB tests

These are tests in `backend/`, written with the built-in Rust test framework, i.e. `#[test]`.
You can find various ones throughout the backend codebase.

There are some very simple tests that test a small piece of code and are completely isolated.
But there are also "database tests" defined in the backend that make sure the DB with our migrations behaves as expected.
These are defined in `db::tests`.
Each DB test sets up an isolated new database and performs all tests inside so that tests running at the same time do not influence each other.

You can run all of these tests via **`cargo test`** in the `backend/` folder.
The DB tests require the development PostgreSQL database to be running, so make sure you ran `./x.sh containers start`.


## Playwright UI tests

These tests are "end to end" tests as they test the whole Tobira application in the same way a user would.
We use [Playwright](https://playwright.dev/) to define those tests.
They live in `frontend/tests`.

In order for these tests to run without interfering with one another, each test is isolated, using its own Tobira binary and database.
A small set of fixed test data can be inserted for the test and a number of small static files (videos, images) are available via a development container.

Therefore, you also have to run `./x.sh containers start` before running these tests.
Further, you have to run `npm ci` in `frontend/` and build the Tobira binary, both done by `./x.sh start`.
Finally, in some situations, git might not have downloaded the static files properly, which you can fix by manually running `git lfs checkout` or `git lfs fetch`.
With all that done, you can run the tests via `npx playwright test` inside `frontend/`.
