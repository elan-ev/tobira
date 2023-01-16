---
sidebar_position: 3
---

# Mode "login-proxy"

```toml
[auth]
mode = "login-proxy"
```

This mode should be used if you want to use Tobira's session management, but you need your own login logic (e.g. to connect to an external authentication system like LDAP).
In this mode, the [information Tobira has about a user](user#user-information-tobira-needs) does not change within one session.
To update any data, the user has to log out and log in again.
If this is not acceptable to you, you have to use [`full-auth-proxy`](full-auth-proxy) instead.

In this mode, you are responsible for handling login attempts.
You just tell Tobira whether it was successful, and if it was, pass user information to Tobira via a `POST /~session` request with auth headers.
Tobira's reply will contain a `Set-Cookie` header that you must forward to the user.
(See [here](in-depth#using-tobiras-session-management) for more information.)

How to proceed depends on whether you want to use the built-in login page (recommended) or your own.


## Using Tobira's login page

As explained [here](in-depth#tobiras-login-page), Tobira's login page sends a `POST /~login` request for each login attempt.
You have to intercept that request somehow, usually in your reverse proxy (e.g. nginx).
Once intercepted, you can handle that request however you like as long as you send the `POST /~session` request (as described above) on succesful login.

This can be done in many different ways, but we recommend writing a Node.js HTTP server by using a JavaScript/TypeScript library provided by us.
The library does all the plumbing work for you.
You just have to run the server and configure your reverse proxy to forward login requests to the Node server.

The following diagram shows the flow of HTTP requests of a user loading the login page, then sending incorrect login data, followed by a succesful login.
*AH* stands for "auth headers".

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

---

How to configure all this can be best shown via example.
We will assume Tobira listens on `localhost:3080` and the auth module (the Node server) listens on `localhost:3091`.

:::caution
The following should only serve as a starting point, not a finished solution.
All non-auth related things have been stripped from the example nginx configs.
Just copy&pasting this without understanding the actual setup has a high risk of creating a system with broken security!
:::

### Configuring nginx

```nginx
server {
    # ...

    # Forward almost all requests to Tobira, but remove auth headers!
    location / {
        proxy_set_header x-tobira-username "";
        proxy_set_header x-tobira-user-display-name "";
        proxy_set_header x-tobira-user-roles "";
        proxy_pass http://localhost:3080;
    }

    # Intercept POST requests to /~login
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

### Setting up the Node auth server

Make sure you have Node installed (which includes `npm`).
Create a new folder and change into it.
Then run `npm install --save @tobira/authkit`.
This should create a few files.
Create the file `index.js` and fill it with this:

```javascript
const { runServer } = require("@tobira/authkit");


const check = async ({ userid, password }) => {
    const user = /* ... */;

    // If the login is incorrect, return the string "forbidden".
    if (!user) {
        return "forbidden";
    }

    // If it is correct, return an object with these three fields. The first two
    // are strings, `roles` is an array of strings.
    return {
        username: user.id,
        displayName: user.name,
        roles: user.roles,
    };
};

runServer({ check });
```

As you can see, you have to implement your custom login logic in `check` (e.g. talk to an LDAP server).
Everything else is handled by `@tobira/authkit`.
See the library's documentation for more information.

Your folder should now look like this:

```
├── index.js
├── node_modules
│   └── ...
├── package.json
└── package-lock.json
```

Run `node index.js` to start your server.
You can test with `curl -X POST 'localhost:3091' -d 'userid=peter&password=verysecure' -v`.

:::tip
You can also use TypeScript to prevent several kinds of bugs alltogether.
`@tobira/authkit` is written in TypeScript and the whole API is well typed.
Unfortunately, it makes running and deploying the server a bit more involved.

<details>
<summary>Some hints for running & deploying TypeScript</summary>

- Of course, you can use `tsc` to create a plain JS version of your code.
- You could use [`ts-node`](https://www.npmjs.com/package/ts-node) to run TS code directly.
- You could use [`@vercel/ncc`](https://npmjs.com/@vercel/ncc) to create a single, easily deployable JS file.

</details>

:::

### Deploying Node auth server

You can of course just do everything from the previous section on your server directly.
But more likely, you want to check the code into git, likely alongside your Ansible script or whatever else deployment automation you use.
You should check `package.json`, `package-lock.json` and `index.js` into git.
For deployment, there are at least two viable options:

- Deploy the three mentioned files to the server into one directory and run `npm ci` there.
  That will install all dependencies specified in `package-lock.json` into `node_modules`.
  Then you can just run `node index.js` as before.
- You can also compile your whole project into a single JS file via [`@vercel/ncc`](https://npmjs.com/@vercel/ncc).
  Run something like `ncc build index.js --minify` locally and deploy only the resulting file `dist/index.js` to your server.
  Then run `node index.js` with that deployed file.

Either way, you likely want to create a proper service for this so that the auth server starts at startup.
Example `.desktop` file:

```systemd
[Unit]
Description=Tobira Auth Server
After=local-fs.target
After=network.target

[Service]
WorkingDirectory=/opt/tobira-auth/
ExecStart=node /opt/tobira-auth/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

<br />

---

## Using your own login page

You have to set `auth.login_link` to some URL and serve your own login page at the specified location.
Then everything is up to you.
You just have to send `POST /~session` to Tobira (as described above) on successful login.

:::note
Even if you want to use `/~login` as path for your own page, you have to set said config option.
(If not set, Tobira uses JavaScript navigation to its own login page, i.e. the login button is not a normal link then.)
:::

