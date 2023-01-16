---
sidebar_position: 1
---

# User login & auth

Regarding this, Tobira is very flexible and works with basically any authentication system you might want to use.
However, this comes at the cost of more work for the person setting up Tobira.
There are no out-of-the-box solutions for LDAP, OpenID connect, Shibboleth, ... or anything else, except Opencast.

## Auth modes

There are four modes (configuration key is `auth.mode`) that Tobira can operate in:

- `"none"`: Login is not possible. Just a safe default, not really useful in practice.
- `"opencast"`: Authentication via the connected Opencast. When a user logs in, Tobira simply sends a request with that login data to Opencast, checking if Opencast deems it correct and if so, obtaining information about the user. Uses Tobira's built-in session management after successful login.
- `"login-proxy"`: Bring your own login logic, but use Tobira's built-in session management.
- `"full-auth-proxy"`: Do everything yourself by putting your own auth logic in front of every route, not using Tobira's session management.

You should likely use the first mode in the list which can satisfy all your requirements.
That's because the list is roughly sorted from "simple & restricted" to "complicated & flexible".

If you only need to login via users that are stored directly by Opencast, use the mode `opencast`.
If you need more flexibility, you need to use one of the `*-proxy` modes:
in case you want to use your own [session management](in-depth#session-management), use [`full-auth-proxy`](full-auth-proxy).
Otherwise, use [`login-proxy`](login-proxy) to use Tobira's built-in session management.
The `*-proxy` modes have their own dedicated documentation which you should read before using them.

:::note
The `"opencast"` mode is very simple and non-configurable.
That's by design.
If you want to do anything non-standard, you have to use one of the other auth modes to specify that logic yourself.
:::

## User information Tobira needs

Tobira requires the following information about each user:

- **Username**: a unique, unchanging, URL-safe identifier for each user.
  An alphabetic ID is preferred over a purely numeric one as it appears in the URL to the user's personal page.
- **Display name**: the user's name in a format intended for humans, e.g. usually something like "Forename Surname".
- **Roles**: a list of roles that are used for authorization (e.g. deciding whether a user is allowed to see a video or modify some data).

In the `"opencast"` mode, this data is retrieved via `/info/me.json` from Opencast.
In the to `"*-proxy"` modes, you have to pass this data explicitly to Tobira via so called *auth headers*.

## Authorization

Tobira does authorization simply by comparing the roles of a user with roles associated with a specific action.
For example, Tobira evaluates the ACL of Opencast events (specifically, the `read` and `write` actions) to determine what a user can do with an event.
Tobira also has a few special roles which grant users with those roles additional privileges like editing the page structure (`ROLE_TOBIRA_MODERATOR`) or uploading videos (`ROLE_TOBIRA_UPLOAD`).

This means you have to model all your authorization logic in terms of these roles.
