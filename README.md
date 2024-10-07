# Tobira: an Opencast Video Portal

![CI Status](https://github.com/elan-ev/tobira/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/github/license/elan-ev/tobira)
![Latest release](https://img.shields.io/github/v/release/elan-ev/tobira?label=latest%20release)

Tobira is a video portal for [Opencast](https://opencast.org) and aims to be a pleasant interface through which users interact with your Opencast content.
It lets you present videos, series and playlists in a customizable, hierarchical page structure, but also makes it easy for users to search through all media.
Additionally, it offers tools to upload and manage videos.
It's possible to connect Tobira to virtually any authentication system and integrate it into your university's/organization's infrastructure.

<p align="center">
    <img src=".github/readme-image.avif" width="95%"></img>
</p>

You can try it out for yourself here: https://tobira.opencast.org.
This is a test deployment of the `main` branch, where most data is wiped whenever it is re-deployed.

## Documentation

All our documentation lives here: [**Tobira's documentation**](https://elan-ev.github.io/tobira).
Among other things, it explains how to install and configure Tobira on your own server.


## Contribute

In short: clone this repository, run the following commands and then open http://localhost:8030/.

```bash
./x.sh containers start
./x.sh start
```

But please see [our developer documentation](https://elan-ev.github.io/tobira/dev) for more information.


### Name

*Tobira* (扉) is Japanese  for "door", "hinged door" or "front page" (of a book).
A video *portal* is a kind of door, so we chose that name.
It is also short and somewhat pronounceable for English speaking people.

