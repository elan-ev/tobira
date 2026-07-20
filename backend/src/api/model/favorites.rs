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
pub(crate) enum FavoriteItem {
    Event(AuthorizedEvent),
    Series(Series),
    Playlist(AuthorizedPlaylist),
    Inaccessible(InaccessibleFavoriteItem),
}

#[derive(GraphQLObject)]
pub(crate) struct InaccessibleFavoriteItem {
    id: Id,
}

pub async fn fetch_for_user(context: &Context) -> ApiResult<Vec<FavoriteItem>> {
    let user = context.require_user()?;

    let (selection, mapping) = db::util::select!(
        is_event: "favorites.event is not null",
        is_series: "favorites.series is not null",
        is_playlist: "favorites.playlist is not null",
        event: AuthorizedEvent from <AuthorizedEvent as FromDb>::select()
            .with_renamed_table("series", "event_series"),
        series: Series,
        playlist: AuthorizedPlaylist,
    );
    let sql = format!("select {selection} from favorites
        left join events on events.id = favorites.event
        left join series as event_series on event_series.id = events.series
        left join series on series.id = favorites.series
        left join playlists on playlists.id = favorites.playlist
        where username = $1
        order by favorites.created desc"
    );
    context.db.query_mapped(&sql, dbargs![&user.username], |row| {
        if mapping.is_event.of(&row) {
            let event = AuthorizedEvent::from_row(&row, mapping.event);
            let id = Id::event(event.key);
            match Event::check_auth(event, &context.auth) {
                Event::Event(e) => FavoriteItem::Event(e),
                Event::NotAllowed(_) => FavoriteItem::Inaccessible(InaccessibleFavoriteItem {
                    id
                }),
            }
        } else if mapping.is_series.of(&row) {
            FavoriteItem::Series(Series::from_row(&row, mapping.series))
        } else if mapping.is_playlist.of(&row) {
            let playlist = AuthorizedPlaylist::from_row(&row, mapping.playlist);
            let id = Id::playlist(playlist.key);
            match Playlist::check_auth(playlist, &context.auth) {
                Playlist::Playlist(p) => FavoriteItem::Playlist(p),
                Playlist::NotAllowed(_) => FavoriteItem::Inaccessible(InaccessibleFavoriteItem {
                    id
                }),
            }
        } else {
            unreachable!("Unknown favorite type")
        }
    }).await.map_err(Into::into)
}

pub async fn add_favorite(id: Id, context: &Context) -> ApiResult<bool> {
    let user = context.require_user()?;

    let event_id = id.key_for(Id::EVENT_KIND);
    let series_id = id.key_for(Id::SERIES_KIND);
    let playlist_id = id.key_for(Id::PLAYLIST_KIND);
    if [event_id, series_id, playlist_id].iter().all(|id| id.is_none()) {
        return Err(invalid_input!("this type of item cannot be added as favorite"));
    }


    if let Some(event_key) = event_id {
        let event = AuthorizedEvent::load_by_key(event_key, context).await?;
        if let Some(Event::NotAllowed(_)) = event {
            return Err(not_authorized!("not allowed to read event"));
        }
    }

    if let Some(playlist_key) = playlist_id {
        let playlist = Playlist::load_by_key(playlist_key, context).await?;
        if let Some(Playlist::NotAllowed(_)) = playlist {
            return Err(not_authorized!("not allowed to read playlist"));
        }
    }

    let sql = "insert into favorites (username, event, series, playlist)
        values ($1, $2, $3, $4)
        on conflict do nothing";
    let res = context.db.execute(sql, &[&user.username, &event_id, &series_id, &playlist_id]).await;
    let affected = map_db_err!(res, {
        if constraint == "favorites_event_fkey" => invalid_input!("event does not exist"),
        if constraint == "favorites_series_fkey" => invalid_input!("series does not exist"),
        if constraint == "favorites_playlist_fkey" => invalid_input!("playlist does not exist"),
    })?;

    Ok(affected == 1)
}

pub async fn remove_favorite(id: Id, context: &Context) -> ApiResult<bool> {
    let user = context.require_user()?;

    let event_id = id.key_for(Id::EVENT_KIND);
    let series_id = id.key_for(Id::SERIES_KIND);
    let playlist_id = id.key_for(Id::PLAYLIST_KIND);
    let sql = "delete from favorites
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
pub(crate) struct FavFeedItem {
    event: Event,

    /// The favorite series that caused this event to appear in the feed. It's
    /// the event's series or `null`.
    fav_series: Option<Series>,

    /// All favorite playlists that caused this event to appear in the feed.
    fav_playlists: Vec<AuthorizedPlaylist>,
}

#[graphql_object(name = "FavFeedConnection", context = Context)]
impl Connection<FavFeedItem> {
    fn page_info(&self) -> &PageInfo {
        &self.page_info
    }
    fn items(&self) -> &[FavFeedItem] {
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
) -> ApiResult<Connection<FavFeedItem>> {
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
        series: Series from <Series as FromDb>::select().with_renamed_table("series", "fav_series"),
        is_playlist: "playlists.id is not null",
        is_series: "fav_series.id is not null",
    );
    let sql = format!("
        select {selection}
        from favorites
            left join series as fav_series on fav_series.id = favorites.series
            left join playlists on playlists.id = favorites.playlist
            cross join unnest(coalesce(playlists.entries, '{{null}}')) as entry
            left join events on events.series = fav_series.id or events.opencast_id = entry.content_id
            left join series on series.id = events.series
        where username = $1
            and events.id is not null
            and (playlists.id is null or playlists.read_roles && $2)
        order by events.created desc
    ");

    // The SQL query can return videos multiple times if they are contained in
    // multiple favorites. I decided to not use `group by`, but instead to group
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
            items.push(FavFeedItem {
                event: Event::check_auth(event, &context.auth),
                fav_series: None,
                fav_playlists: Vec::new(),
            });
        }

        let idx = ids[&event_key];
        let item = &mut items[idx];

        if mapping.is_playlist.of(&row) {
            let playlist = AuthorizedPlaylist::from_row(&row, mapping.playlist);
            item.fav_playlists.push(playlist);
        } else if mapping.is_series.of(&row) {
            let series = Series::from_row(&row, mapping.series);
            item.fav_series = Some(series);
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
