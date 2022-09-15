---
sidebar_position: 4
---

# Example: Your own login page & session management

This example shows how one could configure Tobira to use a custom login page and session management.

:::caution
All of this should only serve as a starting point, not a finished solution.
All non-auth related things have been stripped from the example nginx configs.
Just copy&pasting this without understanding the actual setup has a high risk of creating a system with broken security!
:::

## Shibboleth example

The following example assumes that Shibboleth's FastCGI apps are installed on the machine and that [this nginx Shibboleth module](https://github.com/nginx-shib/nginx-http-shibboleth) is loaded.
Solving this via Lua is... maybe not ideal?
Unfortunately, I haven't found a better solution in time and it certainly works.
I'm very hesitant to make this public, but hopefully it can help people as a starting point.
Please be very cautious before just copying this code!

```nginx
server {
    # ...

    location / {
        # We have to make the authentication subrequest, retrieve the
        # returned information about the user and transform them into the
        # appropriate `x-tobira` headers.
        #
        # Usually, you would use `shib_request` and `shib_request_set` for that.
        # However, the transformation we need to do (base64 and other logic)
        # cannot be (easily) done in nginx itself. So instead, we use lua for
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
                ngx.req.set_header("x-debug", res.status)
                -- TODO: find a better way to case-insensitively lookup in the
                -- table? The exact casing by Shibboleth is "Location", but we
                -- can't rely on that, right?
                for k, v in pairs(res.header) do
                    if string.lower(k) == "location" then
                        ngx.redirect(v, res.status)
                    end
                end
            end

            -- If the login page was requested and we are at this point, the
            -- user just logged in. So let's not show them the login page, but
            -- instead redirect them to the main page.
            if ngx.var.request_uri == "/~login" then
                ngx.redirect("/")
            end

            -- Get information about the user.
            local unique_id = res.header["Variable-uniqueID"]
            local surname = res.header["Variable-surname"]
            local given_name = res.header["Variable-givenName"]
            -- TODO: retrieve more info, according to your Shibboleth.

            local all_fields_set = unique_id ~= nil
                and surname ~= nil
                and given_name ~= nil

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
            else
                ngx.req.clear_header("x-tobira-username");
                ngx.req.clear_header("x-tobira-user-display-name");
                ngx.req.clear_header("x-tobira-user-roles");
            end
        }

        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Host $http_host;
        proxy_pass http://localhost:3080;
    }

    # The assets can be served without any authentication, so we have an extra
    # block to prevent doing useless work.
    location /~assets {
        proxy_set_header x-tobira-username "";
        proxy_set_header x-tobira-user-display-name "";
        proxy_set_header x-tobira-user-roles "";
        proxy_pass http://localhost:3080;
    }


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
}
```
