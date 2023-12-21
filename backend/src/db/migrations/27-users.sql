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

-- For searching users by exact match, we need these indices.
create index idx_user_role_lower on users (lower(user_role));
create index idx_user_username_lower on users (lower(username));
create index idx_user_email_lower on users (lower(email));


-- Search index ---------------------------------------------------------------

-- Next we need to change the 'kind' of things we can insert into the queue to
-- add 'user'.
alter type search_index_item_kind add value 'user';

-- And we also need to install triggers to queue users. However, we cannot do
-- that in this script as a script is run as one transaction and we can't use
-- the 'user' enum value in the same transaction it is added. So this is the
-- next migration script.
