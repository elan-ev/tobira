---
sidebar_position: 4
---

# Auth systems in depth

This document explains the details of different parts of Tobira concerned with auth.
You should read this if you need to configure a `*-proxy` auth mode or some other involved auth setup.


## User information Tobira needs

Tobira requires the following information about each user:

- **Username**: a unique, unchanging, URL-safe identifier for each user.
  An alphabetic ID is preferred over a purely numeric one as it appears in the URL to the user's personal page.
- **Display name**: the user's name in a format intended for humans; usually something like "Forename Surname".
- **Roles**: a list of roles that are used for authorization (e.g. deciding whether a user is allowed to see a video or modify some data).

In the `"opencast"` mode, this data is retrieved via `/info/me.json` from Opencast.
In the to `"*-proxy"` modes, you have to pass this data explicitly to Tobira via so called *auth headers*.


## Auth headers

For the `*-proxy` modes, you have to pass information about users via *auth headers* to Tobira.
These are just designated HTTP headers, one for each kind of information described in the previous section:

- `x-tobira-username`: Username
- `x-tobira-user-display-name`: Display name
- `x-tobira-user-roles`: List of roles, comma separated
- `x-tobira-user-email`: User email address

All these header values have to be a **base64-encoded UTF-8** string!

<details>
<summary>Why Base64?</summary>

It is strongly recommended by the HTTP standard to only include ASCII bytes in HTTP headers.
Arbitrary bytes are *usually* passed through verbatim, but this is not guaranteed and often forbidden.
Base64 encoding is the safer option, that's why we chose it for Tobira.

</details>

For example:

```
x-tobira-username: YXVndXN0dXM=
x-tobira-user-display-name: QXVndXN0dXMgUGFnZW5rw6RtcGVy
x-tobira-user-roles: Uk9MRV9VU0VSX0FVR1VTVFVTLFJPTEVfQU5PTllNT1VTLFJPTEVfVVNFUixST0xFX1NUVURFTlQ=
x-tobira-user-email: YXVndXN0dXNAZXhhbXBsZS5vcmc=
```

Base64 decoding those values results in `augustus`, `Augustus Pagenkämper`, `ROLE_USER_AUGUSTUS,ROLE_ANONYMOUS,ROLE_USER,ROLE_STUDENT` and `augustus@example.org`.

:::danger
**Important**: you have to make sure that your reverse proxy removes any of these header values that the user might have sent!
Tobira blindly trusts these header values and assumes they come from your auth proxy and *not* from the user.
:::


## Login Page

If you set `auth.login_link`, Tobira's login button will simply link to that URL instead of the built-in login page.
You are then responsible for serving an appropriate login page there.
If you don't *need* to use your own login page, try using the built-in one for design-consistency reasons.

### Tobira's login page

When a users enters data and clicks on "login", a POST request is sent to `/~login`.
The login data is sent in the body of the request with `Content-Type: application/x-www-form-urlencoded`.
The keys are `userid` and `password`, so for example, the body could look like: `userid=J%C3%BCrgen&password=foobar`.
(Yep, remember to URL-decode the values.)
Tobira itself only handles this route if `auth.mode = "opencast"`.
For the `*-proxy` modes, you are expected to intercept this request in your reverse proxy.

Tobira's login page expects the following outcomes from the `POST /~login`:

- *204 No Content*: this signals Tobira that the login attempt was successful.
  Tobira's frontend will then signal success and redirect the user back to the page they came from.
- *403 Forbidden*: this signals Tobira that the login attempt was unsuccessful.
  Tobira's frontend will signal this failure and stay on the login page.

The labels for the userid and password field can be configured via `auth.login_page.user_id_label` and `auth.login_page.password_label`.
You can also add a short note to the login page via `auth.login_page.note`.


## Logout Button

By default the logout button will send a `DELETE /~session` request.
If `auth.logout_link` is set, then the logout button will be a simple link to that URL.


## Session management

The session management's job is to track active login sessions, create session IDs (that are usually sent to the user via `Set-Cookie`), and check the session of incoming requests (usually the `Cookie` header).

If your existing authentication system already provides session management (e.g. Shibboleth), you probably want to use that, i.e. use `full-auth-proxy`.
That way, you can get advantages like single sign-on/off.
If you don't have a session management already, you very likely want to use Tobira's (i.e. `login-proxy`) instead of writing your own.
Using Tobira's session management has one main disadvantage:
Tobira only gets information about a user on login, meaning that Tobira could potentially use stale data until the user logs out and in again.

### Using Tobira's session management

There are two routes related to the built-in session management:

- `POST /~session`: Creates a new session.
  Requests to this endpoint must have the *auth headers* set; the HTTP body is *not* inspected.
  On receiving this request, Tobira will write the user information to its database, associate a random session ID with it, and include a `Set-Cookie` header containing the session ID in its response.
- `DELETE /~session`: Destroys the current session by removing it from the database and including an appropriate `Set-Cookie` header in its response.

The first route is only enabled for `auth.mode = "login-proxy"`, the latter also for `auth.mode = "opencast"`.


## Additional routes

- `POST /~login`: Only enabled for `auth.mode = "opencast"`.
  Authenticates via Opencast.
  Creates a session on succesful login and thus has a `Set-Cookie` header in its response in that case.
  Expected headers+body and the returned response in accordance to what the built-in login page sends/expects.


## Auth modes overview

|     | `"opencast"` | `"login-proxy"` | `"full-auth-proxy"` |
| --- | --- | --- | --- |
| Use case | Auth via Opencast | Custom login logic, Tobira's session management | Custom login logic and session management |
| `POST /~login` | **✔ enabled** | ✗ disabled (404) | ✗ disabled (404) |
| `POST /~session` | ✗ disabled (404) | **✔ enabled**, trusts auth headers ⚠️ | ✗ disabled (404) |
| `DELETE /~session` | **✔ enabled** | **✔ enabled** | ✗ disabled (404) |
| Any other route | ignores auth headers | ignores auth headers | **trusts auth headers** ⚠️ |

