use ahash::HashMap;
use futures::pin_mut;
use juniper::{GraphQLObject, GraphQLUnion, graphql_object};

use crate::{
    api::{
        Context,
        Id,
        err::{ApiResult, invalid_input, map_db_err, not_authorized},
        model::{
            event::{AuthorizedEvent, Event},
            playlist::{AuthorizedPlaylist, Playlist},
            series::Series,
            shared::{Connection, PageInfo},
        },
    },
    db::{self, util::select},
    prelude::*,
};




#[derive(GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum BookmarkItem {
    Event(AuthorizedEvent),
    Series(Series),
    Playlist(AuthorizedPlaylist),
    Inaccessible(InaccessibleBookmarkItem),
}

#[derive(GraphQLObject)]
pub(crate) struct InaccessibleBookmarkItem {
    id: Id,
}

pub async fn fetch_for_user(context: &Context) -> ApiResult<Vec<BookmarkItem>> {
    let user = context.require_user()?;

    let (selection, mapping) = db::util::select!(
        is_event: "bookmarks.event is not null",
        is_series: "bookmarks.series is not null",
        is_playlist: "bookmarks.playlist is not null",
        event: AuthorizedEvent from <AuthorizedEvent as FromDb>::select()
            .with_renamed_table("series", "event_series"),
        series: Series,
        playlist: AuthorizedPlaylist,
    );
    let sql = format!("select {selection} from bookmarks
        left join events on events.id = bookmarks.event
        left join series as event_series on event_series.id = events.series
        left join series on series.id = bookmarks.series
        left join playlists on playlists.id = bookmarks.playlist
        where username = $1
        order by bookmarks.created desc"
    );
    context.db.query_mapped(&sql, dbargs![&user.username], |row| {
        if mapping.is_event.of(&row) {
            let event = AuthorizedEvent::from_row(&row, mapping.event);
            let id = Id::event(event.key);
            match Event::check_auth(event, &context.auth) {
                Event::Event(e) => BookmarkItem::Event(e),
                Event::NotAllowed(_) => BookmarkItem::Inaccessible(InaccessibleBookmarkItem {
                    id
                }),
            }
        } else if mapping.is_series.of(&row) {
            BookmarkItem::Series(Series::from_row(&row, mapping.series))
        } else if mapping.is_playlist.of(&row) {
            let playlist = AuthorizedPlaylist::from_row(&row, mapping.playlist);
            let id = Id::playlist(playlist.key);
            match Playlist::check_auth(playlist, &context.auth) {
                Playlist::Playlist(p) => BookmarkItem::Playlist(p),
                Playlist::NotAllowed(_) => BookmarkItem::Inaccessible(InaccessibleBookmarkItem {
                    id
                }),
            }
        } else {
            unreachable!("Unknown bookmark type")
        }
    }).await.map_err(Into::into)
}

pub async fn add_bookmark(id: Id, context: &Context) -> ApiResult<bool> {
    let user = context.require_user()?;

    let event_id = id.key_for(Id::EVENT_KIND);
    let series_id = id.key_for(Id::SERIES_KIND);
    let playlist_id = id.key_for(Id::PLAYLIST_KIND);
    if [event_id, series_id, playlist_id].iter().all(|id| id.is_none()) {
        return Err(invalid_input!("this type of item cannot be added as bookmark"));
    }


    if let Some(event_key) = event_id {
        let event = Event::load(event_key, context).await?;
        if let Some(Event::NotAllowed(_)) = event {
            return Err(not_authorized!("not allowed to read event"));
        }
    }

    if let Some(playlist_key) = playlist_id {
        let playlist = Playlist::load(playlist_key, context).await?;
        if let Some(Playlist::NotAllowed(_)) = playlist {
            return Err(not_authorized!("not allowed to read playlist"));
        }
    }

    let sql = "insert into bookmarks (username, event, series, playlist)
        values ($1, $2, $3, $4)
        on conflict do nothing";
    let res = context.db.execute(sql, &[&user.username, &event_id, &series_id, &playlist_id]).await;
    let affected = map_db_err!(res, {
        if constraint == "bookmarks_event_fkey" => invalid_input!("event does not exist"),
        if constraint == "bookmarks_series_fkey" => invalid_input!("series does not exist"),
        if constraint == "bookmarks_playlist_fkey" => invalid_input!("playlist does not exist"),
    })?;

    Ok(affected == 1)
}

pub async fn remove_bookmark(id: Id, context: &Context) -> ApiResult<bool> {
    let user = context.require_user()?;

    let event_id = id.key_for(Id::EVENT_KIND);
    let series_id = id.key_for(Id::SERIES_KIND);
    let playlist_id = id.key_for(Id::PLAYLIST_KIND);
    let sql = "delete from bookmarks
        where username = $1
        and event is not distinct from $2
        and series is not distinct from $3
        and playlist is not distinct from $4";
    let affected = context.db.execute(sql, &[&user.username, &event_id, &series_id, &playlist_id])
        .await?;

    Ok(affected == 1)
}

#[derive(juniper::GraphQLObject)]
#[graphql(Context = Context)]
pub(crate) struct BookmarkFeedItem {
    event: Event,

    /// The series bookmark that caused this event to appear in the feed. It's
    /// the event's series or `null`.
    series_bookmark: Option<Series>,

    /// All playlist bookmarks that caused this event to appear in the feed.
    playlist_bookmarks: Vec<AuthorizedPlaylist>,
}

#[graphql_object(name = "BookmarkFeedConnection", context = Context)]
impl Connection<BookmarkFeedItem> {
    fn page_info(&self) -> &PageInfo {
        &self.page_info
    }
    fn items(&self) -> &[BookmarkFeedItem] {
        &self.items
    }
    fn total_count(&self) -> i32 {
        self.total_count
    }
}

pub async fn feed(
    context: &Context,
    offset: i32,
    limit: i32,
) -> ApiResult<Connection<BookmarkFeedItem>> {
    if offset < 0 {
        return Err(invalid_input!("offset must be positive or zero"));
    }
    if limit < 1 {
        return Err(invalid_input!("limit must be > 0"));
    }

    let user = context.require_user()?;

    // Alright, querying the feed data!
    //
    // For this kind of "feed" problem, there are mainly two ways to do it.
    // - Persisted feed: the DB stores the feed very close to what the API
    //   returns. This requires updating all affected user feeds when an
    //   relevant DB update is performed. It's also called "fan out write" as
    //   one write operation writes to all user feeds. This write can happen
    //   async or sync.
    // - Pull model: query the feed from the standard DB data when requested.
    //
    // Persisted feeds optimize read performance at the expense of writes and
    // overall complexity. The pull model has to run a more expensive model when
    // querying the feed. For Tobira, the data size is still small enough to
    // allow for both models. For now, this goes with the simpler pull model,
    // simply due to its simplicity.
    //
    // So what makes this query expensive and what is its runtime? Right now
    // it's still not very optimized. Its runtime is in O(|feed|), i.e. it
    // processes all items of the whole feed. Setting a smaller `offset`/`limit`
    // does not influence the query runtime. The problem is that we have to
    // collect videos from all sources and _then_ sort them.
    //
    // There are a number of things one could change to make the runtime depend
    // on offset + limit. For example, one could setup a table
    // `(playlist, video, created)` with an index to retrieve sorted videos by
    // playlist. However, all of these methods introduce complexity &
    // denormalization and crucially, don't reduce the runtime that much in most
    // cases.
    //
    // In my tests, this query seems fast enough (always <1ms). I'm confident to
    // deploy this to our largest production systems right now. Then we can
    // still measure how fast it is and improve if required.
    let (selection, mapping) = select!(
        event: AuthorizedEvent,
        playlist: AuthorizedPlaylist,
        series: Series from <Series as FromDb>::select().with_renamed_table("series", "series_bookmark"),
        is_playlist: "playlists.id is not null",
        is_series: "series_bookmark.id is not null",
    );
    let sql = format!("
        select {selection}
        from bookmarks
            left join series as series_bookmark on series_bookmark.id = bookmarks.series
            left join playlists on playlists.id = bookmarks.playlist
            cross join unnest(coalesce(playlists.entries, '{{null}}')) as entry
            left join events on events.series = series_bookmark.id or events.opencast_id = entry.content_id
            left join series on series.id = events.series
        where username = $1
            and events.id is not null
            and (playlists.id is null or playlists.read_roles && $2)
        order by events.created desc
    ");

    // The SQL query can return videos multiple times if they are contained in
    // multiple bookmarks. I decided to not use `group by`, but instead to group
    // them manually here. For one, grouping by with `array_agg(playlists)` is
    // annoying as it's tricky to deserialize an array of playlists as
    // `AuthorizedPlaylist`. But also, we don't really win anything by it: there
    // is no point in adding offset/limit to the query, as postgres needs to
    // load all items anyway with the current query.
    //
    // We cannot skip `offset` items right ahead, as we don't know how many
    // duplicates are on those. So we just process from the beginning and
    // discard the `offset` first items later. Further, we cannot stop early
    // since we need to figure out the total count. Again, all of that is not
    // really making anything worse since the SQL query processes all events
    // anyway.
    let mut ids = HashMap::default();
    let mut items = Vec::new();
    let rows = context.db.query_raw(&sql, dbargs![&user.username, &context.auth.roles_vec()]).await?;
    pin_mut!(rows);
    while let Some(row) = rows.try_next().await? {
        let event = AuthorizedEvent::from_row(&row, mapping.event);
        let event_key = event.key;
        if !ids.contains_key(&event_key) {
            ids.insert(event_key, items.len());
            items.push(BookmarkFeedItem {
                event: Event::check_auth(event, &context.auth),
                series_bookmark: None,
                playlist_bookmarks: Vec::new(),
            });
        }

        let idx = ids[&event_key];
        let item = &mut items[idx];

        if mapping.is_playlist.of(&row) {
            let playlist = AuthorizedPlaylist::from_row(&row, mapping.playlist);
            item.playlist_bookmarks.push(playlist);
        } else if mapping.is_series.of(&row) {
            let series = Series::from_row(&row, mapping.series);
            item.series_bookmark = Some(series);
        }
    }

    let total_count = items.len() as i32;

    // Discard everything before the offset, and then apply limit.
    items.drain(0..offset as usize);
    items.truncate(limit as usize);

    Ok(Connection {
        page_info: PageInfo {
            has_next_page: offset + limit < total_count,
            has_prev_page: offset > 0,
        },
        items,
        total_count,
    })
}
