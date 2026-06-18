use juniper::{GraphQLObject, GraphQLUnion};

use crate::{
    api::{
        Context,
        Id,
        err::{ApiResult, invalid_input, map_db_err, not_authorized},
        model::{playlist::{AuthorizedPlaylist, Playlist}, series::Series},
    },
    db,
    prelude::*,
};





#[derive(GraphQLUnion)]
#[graphql(Context = Context)]
pub(crate) enum FavoriteItem {
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
        is_series: "series is not null",
        is_playlist: "playlist is not null",
        series: Series,
        playlist: AuthorizedPlaylist,
    );
    let sql = format!("select {selection} from favorites
        left join series on series.id = favorites.series
        left join playlists on playlists.id = favorites.playlist
        where username = $1
        order by favorites.created desc"
    );
    context.db.query_mapped(&sql, dbargs![&user.username], |row| {
        if mapping.is_series.of(&row) {
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

    let series_id = id.key_for(Id::SERIES_KIND);
    let playlist_id = id.key_for(Id::PLAYLIST_KIND);
    if [series_id, playlist_id].iter().all(|id| id.is_none()) {
        return Err(invalid_input!("this type of item cannot be added as favorite"));
    }

    if let Some(playlist_key) = playlist_id {
        let playlist = Playlist::load_by_key(playlist_key, context).await?;
        if let Some(Playlist::NotAllowed(_)) = playlist {
            return Err(not_authorized!("not allowed to read playlist"));
        }
    }

    let sql = "insert into favorites (username, series, playlist)
        values ($1, $2, $3)
        on conflict do nothing";
    let res = context.db.execute(sql, &[&user.username, &series_id, &playlist_id]).await;
    let affected = map_db_err!(res, {
        if constraint == "favorites_series_fkey" => invalid_input!("series does not exist"),
        if constraint == "favorites_playlist_fkey" => invalid_input!("playlist does not exist"),
    })?;

    Ok(affected == 1)
}

pub async fn remove_favorite(id: Id, context: &Context) -> ApiResult<bool> {
    let user = context.require_user()?;

    let series_id = id.key_for(Id::SERIES_KIND);
    let playlist_id = id.key_for(Id::PLAYLIST_KIND);
    let sql = "delete from favorites
        where username = $1
        and series is not distinct from $2
        and playlist is not distinct from $3";
    let affected = context.db.execute(sql, &[&user.username, &series_id, &playlist_id]).await?;

    Ok(affected == 1)
}
