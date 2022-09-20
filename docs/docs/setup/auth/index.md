# Login and Auth

When it comes to authentication, Tobira is very flexible and works with basically any authentication system you might want to use.
However, this comes at the cost of a bit more work on your side.
In other words: authentication does not work out of the box.
This documentation should get you started quickly, though.

Tobira does not authenticate users itself: it does not know about LDAP, OpenID Connect, passwords or anything like that.
*You* have to provide an authentication system that Tobira regards as black box.
**Your system has to pass user information to Tobira via HTTP headers** and thus typically sits in front of Tobira, acting as a **reverse proxy** (also called auth proxy).

Tobira requires the following information about each user.
The values in parentheses are the header names in which Tobira expects this information.
Collectively, these are called **auth headers** in this documentation.

- Username (`x-tobira-username`):
  a unique, unchanging, URL-safe identifier for each user.
  An alphabetic ID is preferred over a purely numeric one as it appears in the URL to the user's personal page.
- Display name (`x-tobira-user-display-name`):
  the user's name in a format intended for humans, e.g. usually something like "Forename Surname".
- Roles (`x-tobira-user-roles`):
  A list of roles belonging to this user.
  See section "Authorization" for more information.

All these header values have to be a **UTF-8** string that has been **base64 encoded**! (It is strongly recommended by the standard to only include ASCII bytes in HTTP headers. Arbitrary bytes are usually passed through verbatim, but this is not guaranteed and often forbidden. base64 encoding is the safer option).

:::caution
**Important**: you have to make sure that your reverse proxy removes any of these header values that the user might have sent!
Tobira blindly trusts these header values and assumes they come from your auth proxy and *not* from the user.
:::

## Authorization

Tobira does authorization simply by comparing the roles of a user with roles associated with a specific action.
For example, Tobira evaluates the ACL of Opencast events (specifically, the `read` and `write` actions) to determine what a user can do with an event.
Tobira also has a few special roles which grant users with those roles additional privileges like editing the page structure (`ROLE_TOBIRA_MODERATOR`) or uploading videos (`ROLE_TOBIRA_UPLOAD`).

This means you have to model all your authorization logic in terms of these roles.


## Setting up authentication

Before you start, you have to decide two things:
- Use Tobira's **login page**, or provide your own?
- Use Tobira's **session handling**, or provide your own?

These two decisions can be made independently of one another (though usually, you would use either both or neither).
The decision depends on your requirements and the authentication system you want to connect to.
See the appropriate documents for more information: [Session Management](./auth/session-management) and [Login Page](./auth/login-page).

There are two specific examples of authentication setups:

- [Using Tobira's login page and session management](./auth/example-all-tobira)
- [Using your own login page and session management](./auth/example-all-own)


## Authenticating Opencast against Tobira

If you happen to use the integration of Tobira into the Opencast Admin-UI
to directly mount newly created series, Opencast has to authenticate
against Tobira as well. This does not use most of the mechanisms above.
Instead, Tobira and Opencast have to share a secret, which Opencast
sends to Tobira under the `x-tobira-trusted-external-key`-header.
Note that this means that your login handler **must not** remove this header.
Don't worry, though! Tobira is going to verify the secret.
However, you should make sure that it is never sent over an untrusted channel.

Note that this "backdoor" is "only" valid for any request that the current
Opencast integration uses. To tell Tobira about this secret,
put it under the key `auth.trusted_key` in your Tobira configuration.
To tell Opencast, put it in `etc/org.opencastproject.adminui.endpoint.SeriesEndpoint.cfg`
under the key `tobira.mh_default_org.trustedKey` (where you might have to replace `mh_default_org`
by your organization ID in case you run a multitenant system).
