---
sidebar_position: 9
---

# Metrics (Prometheus & Grafana)

Tobira exposes metrics in the OpenMetrics format under `/~metrics` (on the same port as the main page runs).
These metrics are tailored to Prometheus and Grafana, using things like "Histogram" from the Prometheus data model.
The endpoint is public as it does not expose any sensitive information.
If you want to restrict access to it anyway, you have to do that via your reverse proxy.

Connecting Prometheus to Tobira should be completely straight forward: just add a new target with the appropriate path and host.
As a starting point for your Grafana dashboard, take a look at [this JSON file](https://github.com/elan-ev/tobira/blob/master/docs/docs/setup/grafana-example-dashboard.json) which you can easily import.
(Please note that this JSON file is on a best effort basis and might not be up to date or optimal.)

The available metrics and their names are not stable yet and we might change or remove them in future Tobira versions.
To get an idea of what metrics exist and how to interpret them, take a look at the Grafana dashboard definition linked above.
