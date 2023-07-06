-- Adds email column to user session.

alter table user_sessions
    add column email text;
