-- Allow auth integrations to specify the path of a user realm, instead of
-- always using the username for that.

alter table user_sessions
    add column user_realm_handle text;

alter table users
    add column user_realm_handle text;
