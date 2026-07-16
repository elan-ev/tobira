create table bookmarks (
    id serial primary key,
    username text not null,
    event bigint,
    series bigint,
    playlist bigint,
    created timestamptz not null default now(),


    -- Writing it manually to give names to constraints
    constraint bookmarks_event_fkey foreign key (event) references all_events on delete cascade,
    constraint bookmarks_series_fkey foreign key (series) references all_series on delete cascade,
    constraint bookmarks_playlist_fkey foreign key (playlist) references playlists on delete cascade,

    -- Unique constraints so that one item can only be bookmarked once. One
    -- constraint per item type as Postgres concisders null <> null in these.
    constraint event_unique unique (username, event),
    constraint series_unique unique (username, series),
    constraint playlist_unique unique (username, playlist),

    -- Only one item is referenced
    constraint just_one_item check (num_nonnulls(event, series, playlist) = 1)
);

create index idx_bookmarks_user on bookmarks (username);
