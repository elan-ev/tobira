---
sidebar_position: 1
---

# User login & auth

Tobira is very flexible when it comes to user authentication.
Thus, it works with basically any authentication system you might want to use.
However, this comes at the cost of more work for the person setting up Tobira.
There are no out-of-the-box solutions for LDAP, OpenID Connect, Shibboleth, or anything else, except Opencast itself.

## Auth modes

There are four modes (configuration key is `auth.mode`) that Tobira can operate in:

- `"none"`: Login is not possible. Just a safe default, not really useful in practice.
- `"opencast"`: Authentication via the connected Opencast.
  When a user logs in, Tobira simply sends a request with the given login data to Opencast, to check whether Opencast deems it correct and to obtain information about the user if that's the case.
  Uses Tobira's built-in session management after a successful login.
- `"login-proxy"`: Bring your own login logic, but use Tobira's built-in session management.
- `"full-auth-proxy"`: Do everything yourself by putting your own auth logic in front of every route, not using Tobira's session management.

The list is roughly sorted from "simple & restricted" to "complicated & flexible".
You should consequently use the first mode in the list which can satisfy all your requirements.

If you only need to login using users that are stored directly by Opencast, use the mode `opencast` (in that case, you can basically stop reading now).
If you need more flexibility, you need to use one of the `*-proxy` modes:
in case you want to use your own [session management](in-depth#session-management), use [`full-auth-proxy`](full-auth-proxy).
Otherwise, use [`login-proxy`](login-proxy) to use Tobira's built-in session management.
The `*-proxy` modes have their own dedicated documentation which you should read before using them.

:::note
The `"opencast"` mode is very simple and non-configurable.
That's by design.
If you want to do anything non-standard, you have to use one of the other auth modes to specify that logic yourself.
:::

## Authorization

Tobira does authorization simply by comparing the roles of a user to roles associated with a specific action.
For example, Tobira evaluates the ACL of Opencast events (specifically, the `read` and `write` actions) to determine what a user can do with an event.
Tobira also has a few special roles which grant users with those roles additional privileges like editing the page structure (`ROLE_TOBIRA_MODERATOR`) or uploading videos (`ROLE_TOBIRA_UPLOAD`).
All of those roles can be found and configured in [`config.toml`](../config).

This means you have to model all your authorization logic in terms of these roles.
