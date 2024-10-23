---
sidebar_position: 4
---

# Using a local Opencast

To connect your Tobira with your local Opencast, you don't have to do much as most things are pre-configured.
You have to start the dev containers with `./x.sh containers start`,
which also starts an nginx listening on `localhost:8081` and `proxy_pass`ing requests to `localhost:8080`, just adding permissive CORS headers.
For that to work, you must configure Opencast to listen on `0.0.0.0` instead of the default `127.0.0.1`.
To do that, change the OC configuration `etc/org.ops4j.pax.web.cfg` and set `org.ops4j.pax.web.listening.addresses` to `0.0.0.0`.

