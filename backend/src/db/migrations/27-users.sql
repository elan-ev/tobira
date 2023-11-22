select prepare_randomized_ids('users');

-- This table stores user information, but note that it's not used for
-- authentication or authorization. That's still handled using external systems,
-- according to 'auth.mode'.
create table users (
    -- Users already have a unique ID but it's usually a good idea using a
    -- artificial primary key anyway. See https://dba.stackexchange.com/q/1910/
    id bigint primary key default randomized_id('users'),
    username text not null unique,

    -- These three are just a cache. For the actual user session, the values
    -- from the login system are always used instead of this. This is just for
    -- the ACL selector UI.
    display_name text not null,
    email text,
    user_role text not null,

    -- The last time this user has made an authenticated request. Is null if the
    -- user was never seen (i.e. the data was imported in another way).
    last_seen timestamp with time zone
);

-- Looking up users by role is a common operation for resolving roles in ACLs.
create unique index idx_user_role on users (user_role);
