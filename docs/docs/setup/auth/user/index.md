---
sidebar_position: 1
---

# User login & auth

Tobira is very flexible when it comes to user authentication.
Thus, it works with basically any authentication system you might want to use.
However, this comes at the cost of more work for the person setting up Tobira.
There are no out-of-the-box solutions for LDAP, OpenID Connect, Shibboleth, or anything else, except Opencast itself.

:::tip
Just getting started with Tobira? To be able to log into Tobira with Opencast users, use this configuration:

```toml
[auth]
source = "tobira-session"
session.from_login_credentials = "opencast"
```

This is a good starting point, so you don't have to completely figure out authentication immediately.

:::


## Options for authenticating incoming requests

When Tobira receives an HTTP request, Tobira has to figure out if it's authenticated and if so, with what user.
You can chose between three options here, configured as `auth.source`:

- **`"none"`**: all requests are unauthenticated. Not useful in practice, just a safe default.
- [**`"tobira-session"`**](./user/tobira-session): Tobira uses its own, built-in session management, checking a cookie against the database of known user sessions.
  To create these sessions (i.e. let users login), there are multiple options.
- [**`"callback:..."`**](./user/callback): Tobira forwards the incoming request to a configured callback, which response specifies how the request is authenticated.
- [**`"trust-auth-headers"`**](./user/trust-auth-headers): Tobira just checks a few fixed headers of the incoming request, which directly specify how the request is authenticated.
  This assumes some auth logic in front of Tobira, i.e. in your reverse proxy.

What to chose? `"tobira-session"` is likely the fastest (in terms of processing time) and easiest to set up, but comes with limitations:
Tobira only gets new data about a user at login, and it's impossible to implement SSO with this.
If you can't use the built-in session management, use `"callback:..."`, which gives you full flexibility.
`"trust-auth-headers"` should be avoided as it has some disadvantages compared to `"callback:..."` (header length limits, easier to configure, ...), but you can still use it if it works well within your system.


## User information Tobira needs

Tobira requires the following information about each user:

- **Username**: a unique, unchanging, URL-safe identifier for each user.
  An alphabetic ID is preferred over a purely numeric one as it appears in the URL to the user's personal page.
- **Display name**: the user's name in a format intended for humans; usually something like "Forename Surname".
- **Roles**: a list of roles that are used for authorization (e.g. deciding whether a user is allowed to see a video or modify some data).
  Needs to contain exactly one role starting with any of the configured `auth.user_role_prefixes`.
- **E-Mail** (optional)

In the `"opencast"` mode, this data is retrieved via `/info/me.json` from Opencast.
In the to `"*-proxy"` modes, you have to pass this data explicitly to Tobira via so called *auth headers*.

## Login page & logout button

You can use your own login page by setting `auth.login_link`, which makes the login button link to the specified URL.
If unset, Tobira's built-in login page is used.

Tobira's logout button will send a `DELETE /~session` request (to delete the current session) if `auth.source` is set to `"tobira-session"`.
If `auth.logout_link` is set, then the logout button will link to that URL.

### Built-in login page

Tobira's built-in login page has two fields (userid & password).
The labels for those fields can be configured via `auth.login_page.user_id_label` and `auth.login_page.password_label`.
You can also add a short note to the login page via `auth.login_page.note`.

When a users enters data and clicks on "login", a POST request is sent to `/~login`.
The login data is sent in the body of the request as `Content-Type: application/x-www-form-urlencoded`.
The keys are `userid` and `password`, so for example, the body could look like: `userid=J%C3%BCrgen&password=foobar`.
(Yep, remember to URL-decode the values.)

The login page expects the following outcomes from the `POST /~login`:

- *204 No Content*: this signals Tobira that the login attempt was successful.
  Tobira's frontend will then signal success and redirect the user back to the page they came from.
- *403 Forbidden*: this signals Tobira that the login attempt was unsuccessful.
  Tobira's frontend will signal this failure and stay on the login page.

You can use this in two ways:
- When using `source = "tobira-session"`, you can set `auth.session.from_login_credentials` to `"opencast"` or `"login-callback:..."`.
- Otherwise, you can intercept the `POST /~login` request with your reverse proxy, performing custom logic that way.












<!--
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
-->

## Authorization

Tobira does authorization simply by comparing the roles of a user to roles associated with a specific action.
For example, Tobira evaluates the ACL of Opencast events (specifically, the `read` and `write` actions) to determine what a user can do with an event.
Tobira also has a few special roles which grant users with those roles additional privileges like editing the page structure (`ROLE_TOBIRA_MODERATOR`) or uploading videos (`ROLE_TOBIRA_UPLOAD`).
All of those roles can be found and configured in [`config.toml`](../config).

This means you have to model all your authorization logic in terms of these roles.
