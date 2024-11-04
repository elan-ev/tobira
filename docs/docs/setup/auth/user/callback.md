---
sidebar_position: 2
---

# Auth callback

> ```toml
> auth.source = "callback:http://localhost:9090/"
> ```

## How it works

In this mode, your custom auth logic sits behind Tobira and is called for every incoming request that needs authentication:

```
┌──────┐                    ┌─────────┐                    ┌────────┐  request headers   ┌────────┐
│      │ -----------------> │ reverse │ -----------------> │        │ -----------------> │  Your  │
│ User │                    │  proxy  │                    │ Tobira │                    │  Auth  │
│      │ <----------------- │         │ <----------------- │        │ <----------------- │  Logic │
└──────┘                    └─────────┘                    └────────┘   auth/user info   └────────┘
```

Your callback needs to be an HTTP endpoint that you specify behind the colon of `callback:`.
You can also use the syntax `http+unix://[/path/to/socket.uds]/foo/bar` to use UDS.
The URL can have a path, but no query or fragment part.
You also have to specify `auth.callback.relevant_headers` and/or `relevant_cookies`: a list of headers/cookies that your auth logic reads.

On receiving a request that needs authentication, Tobira sends a `GET` request to your callback.
That request has no body, but all `relevant_headers` and `relevant_cookies` copied from the incoming request.
If you include `"cookie"` in the `relevant_headers` field, all cookies are always forwarded (note: this would usually make the [caching](#caching) fairly useless, so you probably want to disable it then).
If none of the relevant headers or cookies are in the incoming request, your auth callback is not called at all and the request is treated as unauthenticated.


<details>
<summary>Example requests</summary>

So for example, with this config:

```toml
[auth]
source = "callback:http://localhost:1234/tobiraaaaa"
callback.relevant_headers = ["banana", "kiwi"];
callback.relevant_cookies = ["fox"]
```

If a user sends a request like this:

```
POST /~graphql
Host: tobira.myuni.edu
Content-Type: application/json
Accept: application/json
banana: foo
apple: bar
cookie: funky-session=abc123;fox=is-the-best
kiwi: baz

{ ... graphql query in body }
```

Then Tobira would send the following request to your callback:

```
GET /tobiraaaaa
Host: localhost:1234
banana: foo
cookie: fox=is-the-best
kiwi: baz
```

</details>

Your callback is expected to return UTF-8 encoded JSON.
Said JSON always has to have a top-level `"outcome"` field, plus additional fields depending on the `outcome`.

- `{ "outcome": "no-user" }`: means that the incoming request is not authenticated.
- `{ "outcome": "user", ... }`: means that the incoming request is authenticated.
  User data is specified in these additional fields (with the same semantic as described in ["User information Tobira needs"](./#user-information-tobira-needs)):
  - `username`
  - `displayName`
  - `userRole`
  - `roles`
  - `email` (optional)

So an example `"outcome": "user"` response might look like this:

```json
{
  "outcome": "user",
  "username": "peter",
  "displayName": "Peter Lustig",
  "email": "peter@lustig.de",
  "userRole": "ROLE_USER_PETER",
  "roles": [
    "ROLE_ANONYMOUS",
    "ROLE_USER",
    "ROLE_COURSE_123",
    "ROLE_COURSE_125"
  ]
}
```

## Caching

By default, Tobira caches responses from the auth callback in memory, to speed up successive requests from the same user.
By changing `auth.callback.cache_duration`, you can change the duration or disable caching completely.
The key for the cache is the set of relevant headers including values, as that's the input for your callback.
If the relevant headers in your situation constantly change, the cache will be quite useless and you should disable it (and drop us a quick message so that we can improve the situation).


## Examples

The examples are only sketched and the code is shown only to exemplify how everything works, not necessarily as best practice.
As code, TypeScript using Deno is shown, but you can of course use whatever you want.

### Custom Cookie-based session

You could implement a cookie-based session management yourself.

```toml
[auth]
source = "callback:http://localhost:9090/"

[auth.callback]
relevant_cookies = ["mySession"]
```

Here is an example for the callback daemon.

```ts
import { getCookies } from "https://deno.land/std@0.213.0/http/cookie.ts";


type User = {
  username: string;
  displayName: string;
  email: string;
  userRole: string;
  roles: string[];
}

const lookupSession = (id: string): User | null {
  /* the interesting logic is here... */
};

Deno.serve({ port: 9090 }, request => {
  const sessionID = getCookies(request.headers)["mySession"];
  const user = lookupSession(sessionID);

  return Response.json(
    user
      ? { outcome: "user", ...user }
      : { outcome: "no-user" }
  );
});
```


### Shibboleth

The following is a very rough outline how one could setup authentication via Shibboleth.
It is assumed that Shibboleth's FastCGI apps are installed and [this nginx Shibboleth module](https://github.com/nginx-shib/nginx-http-shibboleth) is loaded.

The basic idea then is to run the "`shibauthorizer`" for every route (that requires it, see below).
That adds a bunch of headers containing information about the user, e.g. `Variable-givenName`.
Those are included in the request sent to Tobira, which Tobira then forwards to your callback.
The callback can read those headers, and build the user information Tobira expects.
It can of course also request additional information from external services, e.g. a list of courses the user is signed up for.

```toml
[general]
reserved_paths = ["Shibboleth.sso"]

[auth]
source = "callback:http://localhost:9090/"
login_link = "/Shibboleth.sso/Login"
logout_link = "/Shibboleth.sso/Logout"

[auth.callback]
relevant_headers = [
    "Variable-uniqueID",
    "Variable-fullName",
    "Variable-mail",
    "Variable-affiliation",
]
```

Here is an example for the callback daemon.

```ts
Deno.serve({ port: 9090 }, request => {
  const uniqueID = request.headers.get("Variable-uniqueID");
  const fullName = request.headers.get("Variable-fullName");
  const email = request.headers.get("Variable-mail");
  const affiliation = request.headers.get("Variable-affiliation");

  // If the headers are not set, the request is not authenticated
  if (!uniqueID || !fullName || !email) {
    return Response.json({ outcome: "no-user" });
  }

  const roles = ["ROLE_ANONYMOUS", "ROLE_USER"];
  if (affiliation == "staff") {
    roles.push("ROLE_STAFF");
  }
  for (const courseID of getCoursesOfUser(uniqueID)) {
    roles.push(`ROLE_COURSE_${courseID}`);
  }

  return Response.json({
    outcome: "user",
    username: uniqueID,
    displayName: fullName,
    email,
    userRole: `ROLE_USER_${uniqueID}`,
    roles,
  });
});
```

You might be asking: if the `shibauthorizer` already has the user data in nginx, i.e. before the request reaches Tobira, why do we pass it through Tobira to the callback?
Good question, and you can actually move your auth logic into the reverse proxy by using `auth.source = "trust-auth-header"`.
However, that has a few disadvantages:
for one, most web servers limit the size of HTTP headers fairly agressively, which leads to problems when your user has lots of roles.
Further, putting that logic into a web server config is quite the adventure.

Finally, you should configure your nginx in a way that `shibauthorizer` is not run for routes that don't need authentication.
For Tobira, everything starting with `/~assets` never needs authentication.
But Tobira itself can decide much more precisely when a request needs to be authenticated, meaning that your callback (your auth logic) is just called when actually necessary.

So the above solution can be improved by having a second nginx server so that the chain looks roughly like this:

```
user -> nginx (no shib) -> Tobira -> nginx (internal, runs shib) -> callback script
```

The `relevant_headers`/`relevant_cookies` need to be adjusted to include everything that the `shibauthorizer` reads.
Then, not only is the `shibauthorizer` only called when the request requires it, but you can also use Tobira's built-in caching.
