# Authentication example: Tobira's login page and session management

This example shows how one could configure a system to use Tobira's login page and session management.
Note that all of this should only serve as a starting point, not a finished solution.
Just copy&pasting this without understanding the actual setup has a high risk of creating a system with broken security!

---

As explained in the overview, you have to:

- Set `auth.mode` to `"login-proxy"` in Tobira's config
- Remove all auth headers from incoming requests before forwarding them to Tobira
- Intercept login attempts (`POST /~login`) & authenticate the user
- On successful login, send `POST /~session` with auth headers to Tobira and forward Tobira's response to the user


Regarding the second point, this can be done in nginx like this, for example:

```
proxy_set_header x-tobira-username "";
proxy_set_header x-tobira-user-display-name "";
proxy_set_header x-tobira-user-roles "";
proxy_pass http://localhost:3080;
```

Regarding the last two points, there are basically two slightly different setups.

## Setup

The "auth module" in the following graphics is shown as separate entity.
But it can of course also be part of your reverse proxy (e.g. an nginx module).

The graphics show a simple GET request to get the login page, one failed login attempt and then a successful one.
**`AH`** in these graphics stands for "auth headers".

### Auth proxy

Here, once the login data has been verified as valid, your auth module sends `POST /~session` to Tobira and forwards Tobira's response back to the user.

```
┌──────┐  GET /~login   ┌─────────┐  GET /~login                                  ┌────────┐
│      │ -------------> │         │ --------------------------------------------> │        │
│      │ <------------- │         │ <-------------------------------------------- │        │
│      │      200       │         │              200                              │        │
│      │                │         │                                               │        │
│      │  POST /~login  │         │  POST /~login  ┌────────┐                     │        │
│      │ -------------> │         │ -------------> │        │                     │        │
│ User │ <------------- │ reverse │ <------------- │        │                     │ Tobira │
│      │      403       │  proxy  │      403       │        │                     │        │
│      │                │         │                │  auth  │                     │        │
│      │  POST /~login  │         │  POST /~login  │ module │ POST /~session + AH │        │
│      │ -------------> │         │ -------------> │        │ ------------------> │        │
│      │ <------------- │         │ <------------- │        │ <------------------ │        │
│      │ 204+Set-Cookie │         │ 204+Set-Cookie │        │    204+Set-Cookie   │        │
│      │                │         │                │        │                     │        │
└──────┘                └─────────┘                └────────┘                     └────────┘
```

Sample nginx config:

```
server {
    # ...

    # Forward almost all requests to Tobira, but remove auth headers!
    location / {
        proxy_set_header x-tobira-username "";
        proxy_set_header x-tobira-user-display-name "";
        proxy_set_header x-tobira-user-roles "";
        proxy_pass http://localhost:3080;
    }

    # Intercept requests to /~login
    location = /~login  {
        # `if` in nginx configs is considered evil, but in this case the easiest
        # solution. We use `rewrite ... last` here which is one of the two
        # things that is guaranteed to work in `if`.
        if ($request_method = POST) {
            rewrite ^ /~internal-login last;
        }

        # If it wasn't POST, we just forward to Tobira, but remove auth headers!
        proxy_set_header x-tobira-username "";
        proxy_set_header x-tobira-user-display-name "";
        proxy_set_header x-tobira-user-roles "";
        proxy_pass http://localhost:3080;
    }

    # We have a `POST /~login` request!
    location = /~internal-login {
        internal;
        proxy_pass http://localhost:3091;  # Your auth server
    }
}
```


### Auth server + `X-Accel-Redirect`

As an alternative, if you don't want to make your auth module act as a reverse-proxy, you can also use the `X-Accel-Redirect` header.
On successful login, your auth server replies with auth headers and `X-Accel-Redirect`.
Then, your main reverse proxy can perform the second request to Tobira.
`XAR` in this graphic stands for `X-Accel-Redirect`.

```
┌──────┐  GET /~login   ┌─────────┐  GET /~login                  ┌────────┐
│      │ -------------> │         │ ----------------------------> │        │
│      │ <------------- │         │ <---------------------------- │        │
│      │      200       │         │              200              │        │
│      │                │         │                               │        │
│      │  POST /~login  │         │  POST /~login  ┌────────┐     │        │
│      │ -------------> │         │ -------------> │        │     │        │
│      │ <------------- │         │ <------------- │        │     │        │
│      │      403       │         │      403       │        │     │        │
│ User │                │ reverse │                │  auth  │     │ Tobira │
│      │  POST /~login  │  proxy  │  POST /~login  │ server │     │        │
│      │ -------------> │         │ -------------> │        │     │        │
│      │                │         │ <------------- │        │     │        │
│      │                │         │   204+AH+XAR   │        │     │        │
│      │                │         │                └────────┘     │        │
│      │                │         │   POST /~session with AH      │        │
│      │                │         │ ----------------------------> │        │
│      │ <------------- │         │ <---------------------------- │        │
│      │ 204+Set-Cookie │         │         204+Set-Cookie        │        │
└──────┘                └─────────┘                               └────────┘
```

Nginx sample configuration: see `/scripts/auth/login-proxy-nginx.conf`.
