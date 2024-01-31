---
sidebar_position: 1
---

# Tobira's session management

> ```toml
> auth.source = "tobira-session"
> ```

## How it works

In this mode, Tobira uses its own session management and your auth logic is only used on user login (i.e. when creating the session).


The session management is quite simple: when creating a session, a random string is generated (the session ID).
That session ID is stored in Tobira's DB with a timestamp and the associated user data, and it is also sent to the user via the `Set-Cookie` header.
For incoming requests, Tobira just reads the cookie and checks it against the DB.
The duration of Tobira's login sessions can be set via `auth.session.duration`.

The interesting part is how to create these sessions.


## Create sessions from login credentials

Tobira's login page sends the credentials to `POST /~login`.
You can hook into that and resolve these credentials to user information in order to create a session.
How the `POST /~login` route behaves can be set via `auth.session.from_login_credentials`:

### Mode `"none"`

404 is returned, i.e. the route is disable.
That means that you have to either set `login_link` (such that Tobira's login page is not used) or you have to intercept these requests with your reverse proxy.

### Mode `"opencast"`

The login credentials are sent to the connected Opencast in a request to `/info/me.json`.
If Opencast deems them valid, Tobira will create a user session with the information Opencast returned.


### Mode `"login-callback:..."`

This allows you to handle login attempts in your own code.
This is similar to [the `"callback:..."` auth source](./callback) in many ways.
You also have to specify an HTTP endpoint and your callback is also expected to return the JSON as specified in the above link.

What's different is that your login callback does not receive the headers of the incoming request, but the login credentials as JSON in the request body (e.g. `{ "userid": "joachim", "password": "blub" }`).
Consequently, `callback.relevant_headers` is ignored for the login-callback.
These login callbacks are *not* cached.

A simple example:

```toml
[auth]
source = "tobira-session"
from_login_credentials = "login-callback:http://localhost:7007"
```

```ts
Deno.serve({ port: 7007 }, async (request) => {
  // Read login credentials
  const { userid, password } = await request.json();

  if (userid === "peter" && password === "verysecure") {
    return Response.json({
      outcome: "user",
      username: "peter",
      displayName: "Peter Lustig",
      roles: ["ROLE_USER_PETER", "ROLE_USER", "ROLE_ANONYMOUS", ...],
    });
  } else {
    return Response.json({
      outcome: "no-user",
    });
  }
});
```


## Create sessions manually via `POST /~session`

For more complex setups, you might want to create Tobira sessions manually and not from Tobira's login mechanism.
That's what the `POST /~session` route is for.
When Tobira receives such a request, it tries to authenticate the request and if that succeeds, a session is created.
The authentication can be done via different means, configured as `auth.session.from_session_endpoint`:

- **`"none"`**: no authentication, will thus always return 401.
- [**`"callback:..."`**](./callback)
- [**`"trust-auth-headers"`**](./trust-auth-headers)

The last two methods work exactly like configuring those as `auth.source`.
So see those docs for more information.
See the examples below to get a better understanding of feature.

### Utility route `GET /~session`

In practice, it's usually easy to configure your external system/login page where to direct to after successful login, while it's hard to send a POST request.
This route helps in these situations: when a user opens this in the browser, a `POST /~session` request is sent by JavaScript and then the user is redirect to the page they were on when clicking on the login button.


## Delete sessions

The `DELETE /~session` route does exactly that.
It reads the session cookie, deletes that session from the DB and replies with a `Set-Cookie` header that removes the cookie from the user's browser.
This request is sent by Tobira's logout button, so you usually don't have to do much.


## Examples

All these examples are just rough sketches, intended to point you in the right direction and explain these concepts more concretely.

### LDAP login

You can hook into login attempts and send the credentials to your LDAP server to verify them.

```toml
[auth]
source = "tobira-session"
session.from_login_credentials = "login-callback:http://localhost:7007"
```

(The code is untested and `ldapts` might not be the best library for the job.)

```ts
import { Client } from 'ldapts';

const client = new Client({
  url: 'ldaps://ldap.myuni.edu',
  // ...
});

Deno.serve({ port: 7007 }, async (request) => {
  const { userid, password } = await request.json();
  try {
    await client.bind(`cn=${userid},dc=myuni,dc=edu`, password);
  } catch (e) {
    return Response.json({ outcome: "no-user" });
  }

  const res = await client.search(`uid=${userid},ou=users,dc=myuni,dc=edu`, { ... });
  const user = ldapSearchToUser(res);

  return Response.json(
    user
      ? { outcome: "user", ...user }
      : { outcome: "no-user" }
  );
});
```


### Own login page & `POST /~session`

If you like to use your own login page, but Tobira's session management, you can configure Tobira like this:

```toml
[general]
reserved_paths = ["/myOwnLogin"] # To prevent creating pages with conflicting path

[auth]
source = "tobira-session"
session.from_session_endpoint = "trust-auth-headers"
login_link = "/myOwnLogin"
```

When a Tobira user clicks on the login button, they are sent to `/myOwnLogin`.
You have to serve your login page there and somehow handle logins.
Once you determined a login request valid, you create a Tobira session by sending `POST /~session` with auth headers containing user information.
Tobira replies with a `Set-Cookie` header, which you have to forward to your user.
Finally, your login page can redirect the user back to Tobira again, where they will be logged in.


### Intercept login attempts

:::info
In most cases, this use case is much better served via [`auth.session.from_login_credentials = "login-callback:..."`](#mode-login-callback).
This example is only included to show all the options.
:::

One possible setup looks like this:

- Set `auth.session.from_session_endpoint = "trust-auth-headers"`
- Your reverse proxy intercepts `POST /~login` requests, reads their login credentials.
- The credentials are checked somehow, determining if a user session should be created.
- If login credentials are incorrect: your reverse proxy replies 403 as expected by Tobira's login page.
- If login credentials are correct:
    - Your reverse proxy sends `POST /~session` with auth headers containing user information.
    - Tobira replies with a `Set-Cookie` header, which your reverse proxy forwards to the user with a "204 No Content" response, as expected by the login page.

This is shown in this diagram:


```
┌──────┐    GET /~login     ┌─────────┐                     GET /~login                     ┌────────┐
│      │ -----------------> │         │ --------------------------------------------------> │        │
│      │ <----------------- │         │ <-------------------------------------------------- │        │
│      │        200         │         │                        200                          │        │
│      │                    │         │                                                     │        │
│      │    POST /~login    │         │    POST /~login    ┌────────┐                       │        │
│      │ -----------------> │         │ -----------------> │        │                       │        │
│ User │ <----------------- │ reverse │ <----------------- │        │                       │ Tobira │
│      │        403         │  proxy  │        403         │        │                       │        │
│      │                    │         │                    │  auth  │                       │        │
│      │    POST /~login    │         │    POST /~login    │ server │  POST /~session + AH  │        │
│      │ -----------------> │         │ -----------------> │        │ --------------------> │        │
│      │ <----------------- │         │ <----------------- │        │ <-------------------- │        │
│      │  204 + Set-Cookie  │         │  204 + Set-Cookie  │        │    204 + Set-Cookie   │        │
│      │                    │         │                    │        │                       │        │
└──────┘                    └─────────┘                    └────────┘                       └────────┘
```

### Shibboleth

In [the docs about the auth callback](./callback), there is already a good Shibboleth example, that can be used without problems.
But maybe you want to use Shibboleth to login, but afterwards want to use Tobira's session management.
In that case, you would proceed as follows:

```toml
[general]
reserved_paths = ["/Shibboleth.sso"]

[auth]
source = "tobira-session"
login_link = "/~login"
logout_link = "/Shibboleth.sso/Logout?return=/"
session.from_session_endpoint = "callback:http://localhost:9090"
callback.relevant_headers = ["Variable-uniqueID", ...]
```

(Note: setting the `login_link` to `/~login` makes sense as if left unset, the login button would be an internal JS-based navigation, not sending a `GET /~login` request.)

In your Shibboleth configuration you would:
- Set `/~login` as protected path such that a user visiting that path is sent to the login page.
- Set the return URL after login to `/~session`

The callback script would be the same as in the Shibboleth example in [the callback docs](./callback).
Finally, you would configure your reverse proxy to run the shibauthorizer only for `GET /~login` and `POST /~session` requests.

All of this results in the following behavior:

- The user visits Tobira first the first time, then clicks the login button.
- That request to `GET /~login` get detected as authorized by the shibauthorizer, which replies 302, redirecting the user to the Shibboleth login page.
- The user logs in and Shibboleth redirects to `/~session`.
- The user loads Tobira's JS from `/~session`, which then sends a `POST /~session` request.
- That request is authorized by shibauthorizer, setting a bunch of Shibboleth headers.
- Tobira receives the request with Shibboleth headers, and due to `session.from_session_endpoint`, it sends a request to the configured callback.
- The callback reads the Shibboleth headers, and returns a JSON blob describing the user to Tobira.
- Tobira receives the user info and creates a session for it, returning a `Set-Cookie` header.
- The user receives the session cookie, now being logged in.
