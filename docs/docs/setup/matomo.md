---
sidebar_position: 11
---

# Matomo

To collect statistical data about Tobira usage, you can use [Matomo](https://matomo.org/).
Tobira's Matomo integration is still very basic and currently only allows you to configure the Paella player to send events.
Tobira itself does not yet send any data.

## Privacy, GDPR and consent

Before collecting any data, you have to understand the legal situation of doing so.
There are two resources on this topic by Matomo:
- [Lawful basis for processing personal data under GDPR with Matomo](https://matomo.org/blog/2018/04/lawful-basis-for-processing-personal-data-under-gdpr-with-matomo/)
- [How to not process any personally identifiable information (PII) with Matomo, and what it means for you](https://matomo.org/blog/2018/04/how-to-not-process-any-personal-data-with-matomo-and-what-it-means-for-you/)

The best way to comply with the law is to make sure the data you collect is no "personaly data"/"personally identifiable information".
If you must, you can instead comply with the law by asking for the users consent.
To do that: you have to wait, because Tobira cannot do that yet.
Will be added in the near future!


## Configuration

First, you have to tell Tobira about your Matomo server so that the correct tracking code can be loaded.

```toml
[matomo]
server = "https://matomo.test.tobira.ethz.ch/matomo/"
site_id = "1"
```

This won't make anything interesting happen though, as Tobira itself does not yet send any events to Matomo itself.
In order to get anything out of this, you have to configure Paella to do so.

```toml
[player]
paella_plugin_config = """{
    "es.upv.paella.userEventTracker": {
        "enabled": true,
        "context": "userTracking"
    },
    "es.upv.paella.matomo.userTrackingDataPlugin": {
        "enabled": true,
        "context": ["userTracking"],
        "matomoGlobalLoaded": true,
        "events": {
            "category": "PaellaPlayer",
            "action": "${event}",
            "name": "${videoId}"
        }
    }
}"""
```

See [the Paella docs](https://github.com/polimediaupv/paella-user-tracking?tab=readme-ov-file#matomo-user-tracking-data-plugin) for more information on configuring this.
Note though that `matomoGlobalLoaded` should be `true`.
