# Helper scripts and files for development

This directory contains several scripts and docker-compose files that help with development of Tobira.
None of these files should be used in production.

- `containers`: definition of docker containers for Tobira development.

- `dev-config`: configuration and dummy assets for starting a development version of Tobira.

- `scripts`: various scripts for Tobira development and building Tobira.
  You usually want to use them via `x.sh` at the repository root.

- `fixtures.sql`: dummy data for Tobira (to be used with `cargo run -- db script ../scripts/fixtures.sql`).

- `dummy-realms.yaml`: dummy realm data for Tobira

