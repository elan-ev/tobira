# Helper scripts for development

This directory contains several scripts and docker-compose files that help with development of Tobira.
None of these files should be used in production.

- `auth-proxy`: an nginx implementing an auth proxy as described in `/docs/auth/all-tobira.md`.
  Listens on port 3090 and forwards requests to 3080, except for login requests which are forwarded to 3091.

- `dev-db`: development PostgreSQL DB. Listens on default Postgres port.

- `login-handler`: a dummy login handler (with fixed login data) as described in `/docs/auth/all-tobira.md`.
  Listens on port 3091.

- `opencast-cors`: an nginx that's a reverse proxy in front of your local Opencast, allowing CORS request.
  Listens on port 8081 and forwards requests to 8080.

- `fixtures.sql`: dummy data for Tobira (to be used with `cargo run -- db script ../scripts/fixtures.sql`).
