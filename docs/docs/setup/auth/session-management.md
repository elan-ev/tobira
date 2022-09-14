---
sidebar_position: 2
---

# Session Management

The session management's job is to track active login sessions, create session IDs (that are usually sent to the user via `Set-Cookie`), and check the session of incoming requests (usually the `Cookie` header).

If your existing authentication system already provides session management (e.g. Shibboleth), you probably want to use that.
That way, you can get advantages like single sign-on/sign-off.
If you don't have a session management already, you very likely want to use Tobira's instead of writing your own custom one.
Using Tobira's session management has one main disadvantage:
Tobira only gets information about a user on login, meaning that Tobira could potentially use stale data if a user's display name or roles changed.


## Using Tobira's session management

There are two routes related to session management:

- `POST /~session`: Creates a new session.
  Requests to this endpoint must have the *auth headers* set; the HTTP body is *not* inspected.
  On receiving this request, Tobira will write the user information to its database, associate a random session ID with it, and include a `Set-Cookie` header containing the session ID in its response.

- `DELETE /~session`: Destroys the current session by removing it from the database and including an appropriate `Set-Cookie` header in its response.

To use Tobira's session management, you have to set the `auth.mode` configuration to `"login-proxy"`.
This instructs Tobira to read and trust the auth headers from `POST /~session` requests.
In your reverse proxy, you have to intercept login attempts (see [Login page](./login-page)), read the login data, and authenticate the user.
Then, depending on the outcome:

- If the login data was incorrect, you signal that login failure to the login page.

- If the login data was correct, you have to send a `POST /~session` request with auth headers to Tobira.
  Tobira answers with a `Set-Cookie` header that you then have to forward to the user.

Tobira's logout button works out of the box and you don't have to intercept anything for that.


:::danger
You have to make sure that users cannot send auth headers directly to `POST /~session`.
You can easily do that by removing all auth headers of incoming requests.
:::


## Using your own session management

In this case, set the `auth.mode` configuration to `"full-auth-proxy"`.
This instructs Tobira to read and trust the auth headers on every incoming request.

:::danger
This means your reverse proxy must be configured to **remove auth headers from incoming requests** and set appropriate auth headers before forwarding incoming requests to Tobira.
:::danger

To create new sessions, you have to intercept login attempts (see [Login page](./login-page)), read the login data, and authenticate the user and send an appropriate response to the login-page (likely containing a `Set-Cookie` header).
To destroy sessions, you have to intercept logout attempts (`DELETE /~session`) and delete the session as appropriate.
Alternatively, you can set `auth.logout_link` in the config to make the logout button a simple `<a>` link to that URL.

:::info
*Exception*: you don't need to set headers for requests to paths starting with `/~assets`.
Those are just static files that everyone can access.
Skipping authentication for these paths is recommended for performance reasons.
:::
