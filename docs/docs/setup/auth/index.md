---
sidebar_position: 8
---

# Login and Auth

The topic of authentication and authorization comes up in the context of Tobira in several situations, each described in its own section in this document:

- [Users authenticating themselves against Tobira](#user-login) (i.e. logging into Tobira)
- [Tobira authenticating against Opencast](#tobira-against-opencast) (used for for syncing)
- [Opencast authenticating against Tobira](#opencast-against-tobira) (used to change pages in the Opencast admin UI)
- [Tobira cross-authenticating its users against Opencast](#cross-auth-users-against-opencast) (used for the uploader, Studio and the editor)

---

## User login & auth {#user-login}

Users logging into Tobira via the normal web UI is discussed in [this document](./auth/user).




## Tobira authenticating against Opencast {#tobira-against-opencast}

To synchronize data (about events and series), Tobira has to talk to Opencast.
Of course, those requests need to be authenticated.
The user login data used for those requests has to be configured in the `[sync]` section.
Make sure that the user is able to read *all* events and series.
Currently that basically requires the user to have `ROLE_ADMIN`.


## Authenticating Opencast against Tobira {#opencast-against-tobira}

If you happen to use the integration of Tobira into the Opencast Admin-UI
to directly mount newly created series, Opencast has to authenticate
against Tobira as well. This does not use most of the mechanisms above.
Instead, Tobira and Opencast have to share a secret, which Opencast
sends to Tobira under the `x-tobira-trusted-external-key`-header.
Note that this means that your reverse proxy **must not** remove this header.
Don't worry, though! Tobira is going to verify the secret.
However, you should make sure that it is never sent over an untrusted channel.

Note that this "backdoor" is "only" valid for any request that the current
Opencast integration uses. To tell Tobira about this secret,
put it under the key `auth.trusted_key` in your Tobira configuration.
To tell Opencast, put it in `etc/org.opencastproject.adminui.endpoint.SeriesEndpoint.cfg`
under the key `tobira.mh_default_org.trustedKey` (where you might have to replace `mh_default_org`
by your organization ID in case you run a multitenant system).


## Authenticating Tobira users against Opencast services {#cross-auth-users-against-opencast}

If a user is logged into Tobira and (their browser) has to talk directly to Opencast (e.g. for the uploader, Studio or the editor), then a problem arises:
the user does not necessarily have a login session in Opencast, so those requests might be unauthenticated.
As a solution, Tobira can cross-authenticate those users against Opencast.
This basically means that Tobira tells Opencast to "trust that this user is legit" so that the human user does not have to login again.

This is done via JSON Web Tokens (JWTs).
Setting that up is explained in [this document](./auth/jwt).

This cross-authentication is required for the uploader.
For Studio and Editor, it's only required if you don't have a single sign-on (SSO) solution.
If you don't (and thus want to use cross-auth for those two services), you have to set `auth.pre_auth_external_links` to `true` in the configuration.
