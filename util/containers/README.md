# Tobira development containers

A short overview over containers (see the compose file for more information):

There is a container for a PostgreSQL DB and a container for MeiliSearch.
These are straight forward.
Then there is `opencast-cors-proxy` which is just an nginx in front of Opencast to set some CORS headers that are required for the uploader in Tobira to work.

The two containers `tobira-auth-proxy` and `tobira-login-handler` are for dummy authentication for developers.
The `tobira-auth-proxy` is an nginx implementing an auth proxy as described in `/docs/auth/all-tobira.md`.
It listens on port 3090 and forwards requests to 3080, except for login requests which are forwarded to 3091.
`login-handler` is a dummy login handler (with fixed login data) as described in `/docs/auth/all-tobira.md` that listens on port 3091.
