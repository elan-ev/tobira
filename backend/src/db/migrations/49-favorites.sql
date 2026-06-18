create table favorites (
    id serial primary key,
    username text not null,
    series bigint,
    playlist bigint,
    created timestamptz not null default now(),


    -- Writing it manually to give names to constraints
    constraint favorites_series_fkey foreign key (series) references all_series on delete cascade,
    constraint favorites_playlist_fkey foreign key (playlist) references playlists on delete cascade,

    -- Unique constraints so that one item can only be favorited once. One
    -- constraint per item type as Postgres concisders null <> null in these.
    constraint series_unique unique (username, series),
    constraint playlist_unique unique (username, playlist),

    -- Only one item is referenced
    constraint just_one_item check (num_nonnulls(series, playlist) = 1)
);

create index idx_favorites_user on favorites (username);
