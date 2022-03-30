# Authentication and Authorization

When it comes to authentication, Tobira is very flexible and works with basically any authentication system you might want to use.
However, this comes at the cost of a bit more work on your side.
In other words: authentication does not work out of the box.
This documentation should get you started quickly, though.

Tobira does not authenticate users itself: it does not know about LDAP, OpenID Connect, passwords or anything like that.
*You* have to provide an authentication system that Tobira regards as black box.
**Your system has to pass user information to Tobira via HTTP headers** and thus typically sits in front of Tobira, acting as a **reverse proxy** (also called auth proxy).

Tobira requires the following information about each user.
The values in the parenthesis are the header names in which Tobira expects this information.
Collectively, these are called **auth headers** in this documentation.

- Username (`x-tobira-username`):
  a unique, unchanging, URL-safe identifier for each user.
  An alphabetic ID is preferred over a purely numeric one as it appears in the URL to the user's personal page.
- Display name (`x-tobira-user-display-name`):
  the user's name in a format intended for humans, e.g. usually something like "Forename Surname".
- Roles (`x-tobira-user-roles`):
  A list of roles belonging to this user.
  See section "Authorization" for more information.

**Important**: you have to make sure that your reverse proxy removes any of these header values that the user might have sent!
Tobira blindly trusts these header values and assumes they come from your auth proxy and *not* from the user.


## Authorization

Tobira does authorization simply by comparing the roles of a user with roles associated with a specific action.
For example, Tobira evaluates the ACL of Opencast events (specifically, the `read` and `write` roles) to determine what a user can do with an event.
Tobira also has a few special roles which grant users with those roles additional privileges like editing the page structure (`ROLE_TOBIRA_MODERATOR`) or uploading videos (`ROLE_TOBIRA_UPLOAD`).

This means you have to model all your authorization logic in terms of these roles.


## Setting up authentication

Before you start, you have to decide whether you want to use Tobira's **login page** and/or **session handling**, or – alternatively – provide your own.
Regarding login page: if you don't *need* to use your own login page, try using the built-in one for design-consistency reasons.

It gets slightly more complicated regarding session management.
On the one hand, rolling your own session management typically takes time and effort, and requires special care to make sure it's actually secure.
It also requires you to have your auth proxy in front of (almost) every Tobira route, potentially slowing down requests.
On the other hand, using Tobira's session management has one main disadvantage:
Tobira only gets information about a user on login, meaning that Tobira could potentially use stale data if a user's display name or roles changed.
It also doesn't support *single sign-out*/*single sign-on*.

In either case, you need a reverse proxy in front of Tobira.
In this documentation, we will use nginx.
We assume basic understanding of how to set up a reverse proxy in front of a backend application.

The following subsection describes the general approach when using/not using Tobira's login page/session management.
For a more concrete look at how a setup might look like, check out these specific cases:

- [Tobira's login page and session management](./all-tobira.md)

<br>

### Using Tobira's session management

There are two routes related to session management:

- `POST /~session`: Creates a new session.
  Requests to this endpoint must have the *auth headers* set; the HTTP body is *not* inspected.
  On receiving this request, Tobira will write the user information to its database, associate a random session ID with it, and include a `Set-Cookie` header containing the session ID in its response.

- `DELETE /~session`: Destroys the current session by removing it from the database and including an appropriate `Set-Cookie` header in its response.

To use Tobira's session management, you have to set the `auth.mode` configuration to 'login-proxy'.
In your reverse proxy, you have to intercept login attempts (see "Login page" sections), read the login data, and authenticate the user.
Then, depending on the outcome:

- If the login data was incorrect, you signal that login failure to the login page.

- If the login data was correct, you have to send a `POST /~session` request with auth headers to Tobira.
  Tobira answers with a `Set-Cookie` header that you then have to forward to the user.

Tobira's logout button works out of the box and you don't have to intercept anything for that.

**Important**: you have to make sure that users cannot send auth headers directly to `POST /~session`.
You can easily do that by removing all auth headers of incoming requests.


### Using your own session management

In this case, set the `auth.mode` configuration to 'full-auth-proxy'.
This instructs Tobira to read and trust the auth headers on every incoming request.
This means your reverse proxy must be configured to **remove auth headers from incoming requests** (important!) and set appropriate auth headers before forwarding incoming requests to Tobira.

*Exception*: you don't need to set headers for requests to paths starting with `/~assets`.
Those are just static files that everyone can access.
Skipping authentication for these paths is recommended for performance reasons.

To create new sessions, you have to intercept login attempts (see "Login page" sections), read the login data, and authenticate the user and send an appropriate response to the login-page (likely containing a `Set-Cookie` header).
To destroy sessions, you have to intercept logout attempts (`DELETE /~session`) and delete the session as appropriate.
Alternatively, you can set `auth.logout_link` in the config to make the logout button a simple `<a>` link to that URL.


### Using Tobira's login page

If you leave `auth.login_link` unset, the login button will link to Tobira's own login page.
When a users enters data and clicks on "login", a POST request is sent to `/~login`.
The login data is sent in the body of the request with `Content-Type: application/x-www-form-urlencoded`.
The keys are `userid` and `password`, so for example, the body could look like: `userid=J%C3%BCrgen&password=foobar`.
(Yep, remember to URL-decode the values.)
Tobira itself does not handle this route as it expects you to intercept this request.

Tobira's login page expects the following outcomes from the `POST /~login`:

- 204 No Content: this signals Tobira that the login attempt was successful.
  Tobira's frontend will then signal success and redirect the user back to the page they came from.

- 403 Forbidden: this signals Tobira that the login attempt was unsuccessful.
  Tobira's frontend will signal this failure and stay on the login page.

The labels for the userid and password field can be configured via `auth.login_page.user_id_label` and `auth.login_page.password_label`.
You can also add a short note to the login page via `auth.login_page.note`.


### Using your own login page

In order to use your own login page you have to set `auth.login_link` to an absolute path or even external URL.
Tobira's "login" buttons in the header will then directly link to that URL.
You are then responsible for presenting a login page for that URL.
Of course, then you define how a login attempt looks like and what to do on a successful login.

