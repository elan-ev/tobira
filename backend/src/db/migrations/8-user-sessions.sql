create table user_sessions (
    -- Random byte string identifying the session. Stored in cookies (base64-encoded).
    id bytea primary key,

    -- Information about the user
    username text not null,
    display_name text not null,
    roles text[] not null,

    -- When the session was created. Always in UTC!
    created timestamp not null default now(),

    -- When the session was last used. Always in UTC!
    last_used timestamp not null default now()
);
