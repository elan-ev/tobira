---
sidebar_position: 3
---

# Mode "full-auth-proxy"

```toml
[auth]
mode = "full-auth-proxy"
```

This mode should be used if you want to use your own or an existing session management (e.g. that of Shibboleth).
If any of the other auth modes work for you, rather use those to make the setup easier.

In this mode, it is expected that all incoming requests are intercepted and that all user information is always passed to Tobira via [auth headers](in-depth#auth-headers).
Tobira will not inspect any `Cookie` headers and will not react to login requests.
From Tobira's perspective it's easy: if the auth headers are set, the request is authenticated, otherwise it's not.

How you do this is ultimately up to you, but this document explains some rough starting points.
Most information in ["Auth systems in depth"](in-depth) is relevant here, so be sure to read that document.

:::tip
Authentication is irrelevant for requests to `/~assets/*` as those are just static files everyone can access.
Don't run your auth logic for those to prevent useless work.
:::

:::danger
Remember to never forward auth headers set by the user to Tobira.
Otherwise it's extremely easy for someone to pretend to be anyone and get access to anything.
:::


## Basics

Example nginx config:

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

How to implement the "TODO" in that nginx block?
Again, that's up to you, but usually you would send some kind of "auth sub request".
That means that the incoming request is first sent to some other service speaking HTTP.
That service evaluates the request (e.g. by reading the `Cookie` header) and sends back information about authentication via headers.
That information would land in nginx, then being forwarded to Tobira alongside the original request.
See [this](https://docs.nginx.com/nginx/admin-guide/security-controls/configuring-subrequest-authentication/) for the general idea.

That external auth service could be something existing (like the shibauthorizer from Shibboleth) or your own HTTP server.
One difficulty lies in getting the user data into the exact shape Tobira expects.
For example, nginx offers no easy way to encode something as base64.
So unless your existing auth service already offers base64 encoding and the exact headers you need, you have to write some custom code to shuffle some data around.

## Shibboleth example

The following is a very rough outline how one could setup authentification via Shibboleth.
We were very hesitant to include this part in the official docs as it's far from perfect and not a recommendation!
If you know how to improve upon this, please let us know.
Please be very cautious before just copying this code!

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
