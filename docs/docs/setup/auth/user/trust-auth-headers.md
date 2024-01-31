---
sidebar_position: 3
---

# Trust auth headers

> ```toml
> auth.source = "trust-auth-headers"
> ```

## How it works

In this mode, your custom auth logic sits in front of Tobira and passes user information to it via *auth headers*.
From Tobira's perspective it's easy: if the auth headers are set, the request is authenticated, otherwise it's not.
*Note*: the [auth callback](./callback) method is better than this in most cases, so try to use that instead.

```
┌──────┐                    ┌─────────┐────────┐  req with auth headers   ┌────────┐
│      │ -----------------> │ reverse │  Your  │ -----------------------> │        │
│ User │                    │  proxy  │  Auth  │                          │ Tobira │
│      │ <----------------- │         │  Logic │ <----------------------- │        │
└──────┘                    └─────────┘────────┘                          └────────┘
```

:::tip
Authentication is irrelevant for requests to `/~assets/*` as those are just static files everyone can access.
Don't run your auth logic for those to prevent useless work.
:::

The *auth headers* are just designated HTTP headers, one for each kind of information described in ["User information Tobira needs"](./#user-information-tobira-needs):

- `x-tobira-username`: Username
- `x-tobira-user-display-name`: Display name
- `x-tobira-user-roles`: List of roles, comma separated.
  Must contain exactly one role starting with any of `auth.user_role_prefixes`, which is treated as the user role.
- `x-tobira-user-email`: User email address (optional)

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


## Examples

Very simple nginx config:

```nginx
server {
    # ...

    location / {
        # TODO: somehow check login here!

        # Pass user information determined above to Tobira.
        proxy_set_header x-tobira-username $username;
        proxy_set_header x-tobira-user-display-name $display_names;
        proxy_set_header x-tobira-user-roles $roles;
        proxy_set_header x-tobira-user-email $email;
        proxy_pass http://localhost:3080;
    }

    # Assets can be served without any authentication, so we have an extra
    # block to prevent doing useless work.
    location /~assets {
        # Currently Tobira doesn't inspect these headers for assets, but better
        # be safe than sorry and remove them anyway!
        proxy_set_header x-tobira-username "";
        proxy_set_header x-tobira-user-display-name "";
        proxy_set_header x-tobira-user-roles "";
        proxy_set_header x-tobira-user-email "";
        proxy_pass http://localhost:3080;
    }
}
```

If you use Tobira's login page, you have to properly intercept and react to the `POST /~login` requests sent by it.
Alternatively, you can use your own login page of course.

Of course the "TODO" part is the interesting one.
How you implement that logic is up to you.
You would usually ask an external system (like Shibboleth) about the request, and then pack the Shibboleth data into the auth headers.


### Shibboleth example

The following is a very rough outline how one could setup authentification via Shibboleth.
We were very hesitant to include this part in the official docs as it's far from perfect and not a recommendation!
If you know how to improve upon this, please let us know.
Please be very cautious before just copying this code!

:::tip
[The auth callback docs](./callback) have a Shibboleth example as well, which is better in many ways compared to this one!
:::

You have to install Shibboleth's FastCGI apps on the machine and make sure that [this nginx Shibboleth module](https://github.com/nginx-shib/nginx-http-shibboleth) is loaded.
Then, the basic idea is to use a Lua block inside nginx to convert Shibboleth's data into the form Tobira expects.
Again, likely not ideal, especially because this solution reimplements logic of `shib_request`.

Nginx config implementing that idea:

```nginx
location / {
    # We have to make the authentication subrequest, retrieve the
    # returned information about the user and transform them into the
    # appropriate `x-tobira` headers.
    #
    # Usually, you would use `shib_request` and `shib_request_set` for that.
    # However, the transformation we need to do (base64 and other logic)
    # cannot (easily) be done in nginx itself. So instead, we use lua for
    # all of it.
    access_by_lua_block {
        -- Send the auth subrequest. Always use GET and never forward the
        -- main request's body.
        local res = ngx.location.capture("/shibauthorizer", {
            method = ngx.HTTP_GET,
            body = ''
        })

        -- If the auth request responds with a redirect, we need to send that
        -- to the user, because it means the user is prompted to login.
        if res.status >= 300 and res.status < 400 then
            -- TODO: find a better way to case-insensitively lookup in the
            -- table? The exact casing by Shibboleth is "Location", but we
            -- can't rely on that, right?
            for k, v in pairs(res.header) do
                if string.lower(k) == "location" then
                    ngx.redirect(v, res.status)
                end
            end
        end

        -- Get information about the user.
        local unique_id = res.header["Variable-uniqueID"]
        local surname = res.header["Variable-surname"]
        local given_name = res.header["Variable-givenName"]
        local email = res.header["Variable-mail"]
        -- TODO: retrieve more info, according to your Shibboleth.

        local all_fields_set = unique_id ~= nil
            and surname ~= nil
            and given_name ~= nil
            and email ~= nil

        if res.status == 200 and all_fields_set then
            local display_name = given_name .. " " .. surname
            local roles = {
                "ROLE_ANONYMOUS",
                "ROLE_USER",
                -- TODO: insert custom logic here to determine roles!
            }

            ngx.req.set_header("x-tobira-username", ngx.encode_base64(unique_id))
            ngx.req.set_header("x-tobira-user-display-name", ngx.encode_base64(display_name))
            ngx.req.set_header("x-tobira-user-roles", ngx.encode_base64(table.concat(roles, ",")))
            ngx.req.set_header("x-tobira-user-email", ngx.encode_base64(email))
        else
            ngx.req.clear_header("x-tobira-username");
            ngx.req.clear_header("x-tobira-user-display-name");
            ngx.req.clear_header("x-tobira-user-roles");
            ngx.req.clear_header("x-tobira-user-email");
        end
    }

    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Host $http_host;
    proxy_pass http://localhost:3080;
}
```

Also add two Shibboleth specific locations:

```nginx
# FastCGI authorizer for Shibboleth Auth Request module
location = /shibauthorizer {
    internal;
    include fastcgi_params;
    fastcgi_pass unix:/run/shibboleth/shibauthorizer.sock;
}

# FastCGI responder for SSO
location /Shibboleth.sso {
    include fastcgi_params;
    fastcgi_pass unix:/run/shibboleth/shibresponder.sock;
}
```


