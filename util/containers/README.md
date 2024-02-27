# Containers for Tobira development & production use

## Dockerfile for production use

The `Dockerfile` is for building a container that can be used to deploy Tobira in production.


## Development containers

Most files in this directory are for setting up development environment.

There is a container for a PostgreSQL DB and a container for MeiliSearch.
These are straight forward.
Then there is `opencast-cors-proxy` which is just an nginx in front of Opencast to set some CORS headers that are required for the uploader in Tobira to work.
Finally, the container `tobira-login-handler` implements a login callback with dummy users for developers, which listens on port 3091.
