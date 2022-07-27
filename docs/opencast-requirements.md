# What Tobira requires of Opencast

Tobira doesn't work with any Opencast instance out of the box.
There are some requirements.

- The Tobira Opencast module needs to be installed.
  This is currently developed [here](https://github.com/elan-ev/opencast-tobira).
  The module, in turn, requires at least Opencast 11.

- No static file authorization.
  Tobira links to various assets (thumbnails, videos, ...) on Opencast's servers.
  Most users will only be authenticated against Tobira, not Opencast.
  So all these requests for assets are unauthenticated, from Opencast perspective.
  This means that non-public assets cannot be retrieved, meaning that non-public events will look broken in Tobira.
  So either you disable static file authorization in Opencast or you can only use Tobira for public videos.

  (We are aware that this limitation is annoying and are investigating possible solutions.)

- Opencast needs to accept JWTs created by Tobira.
  See [this document](./auth/jwt.md) for more information.

- Opencast needs to allow cross origin requests from Tobira.
  Otherwise, things like the video uploader don't work.

- We assume that everyone who has `write` access to something also has `read`
  access. We often don't check the roles allowed to read if we already checked
  the roles allowed to write.
