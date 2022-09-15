---
sidebar_position: 1
---

# Login Page

If you don't *need* to use your own login page, try using the built-in one for design-consistency reasons.
However, it's likely that your existing authentication system (e.g. Shibboleth) requires a custom login page.


## Using Tobira's login page

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


## Using your own login page

In order to use your own login page you have to set `auth.login_link` to an absolute path or even external URL.
Tobira's "login" buttons in the header will then directly link to that URL.
You are then responsible for presenting a login page for that URL.
Of course, then you define how a login attempt looks like and what to do on a successful login.
