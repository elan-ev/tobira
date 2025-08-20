-- Allow auth integrations to specify the path of a user realm, instead of
-- always using the username for that. We also use this opportunity to add a
-- user_role column to the session table.

alter table user_sessions
    add column user_role text,
    add column user_realm_handle text;

alter table users
    add column user_realm_handle text;
