use crate::{prelude::*, model::Key, search::IndexItemKind};
use super::util::TestDb;


macro_rules! set {
    ($($e:expr),* $(,)?) => {
        std::collections::HashSet::from([$($e),*])
    };
}


struct Setup {
    animals: Key,
    dog: Key,
    cat: Key,
    momo: Key,
    people: Key,
    series_a: Key,
    series_b: Key,
    series_c: Key,
    series_empty: Key,
    video_free0: Key,
    video_free1: Key,
    video_a0: Key,
    video_a1: Key,
    video_b0: Key,
    video_b1: Key,
    video_b2: Key,
    video_c0: Key,
    playlist_a: Key,
    playlist_b: Key,
    playlist_empty: Key,
}

/// Create a test DB with a few test objects in it. The search queue is cleared
/// by this function. The following realm tree is created:
///
/// ```text
/// - animals
///   - dog
///   - cat
///     - momo
/// - people
/// ```
async fn setup() -> Result<(TestDb, Setup)> {
    let db = TestDb::with_migrations().await?;

    let animals = db.add_realm("Animals", Key(0), "animals").await?;
    let people = db.add_realm("People", Key(0), "people").await?;
    let cat = db.add_realm("Cat", animals, "cat").await?;
    let dog = db.add_realm("Dog", animals, "dog").await?;
    let momo = db.add_realm("Momo", cat, "momo").await?;

    let series_a = db.add_series("Series A", "series-a").await?;
    let series_b = db.add_series("Series B", "series-b").await?;
    let series_c = db.add_series("Series C", "series-c").await?;
    let series_empty = db.add_series("Empty", "series-empty").await?;
    let video_free0 = db.add_event("Lonely0", 123, "lonely0", None).await?;
    let video_free1 = db.add_event("Lonely1", 543, "lonely1", None).await?;
    let video_a0 = db.add_event("Video A0", 60, "video-a0", Some(series_a)).await?;
    let video_a1 = db.add_event("Video A1", 80, "video-a1", Some(series_a)).await?;
    let video_b0 = db.add_event("Video B0", 100, "video-b0", Some(series_b)).await?;
    let video_b1 = db.add_event("Video B1", 101, "video-b1", Some(series_b)).await?;
    let video_b2 = db.add_event("Video B2", 102, "video-b2", Some(series_b)).await?;
    let video_c0 = db.add_event("Video C0", 200, "video-c0", Some(series_c)).await?;

    let playlist_a = db.add_playlist("Playlist A", "pl-a", &[video_free0, video_a0]).await?;
    let playlist_b = db.add_playlist("Playlist B", "pl-b", &[video_free0, video_a1, video_b2]).await?;
    let playlist_empty = db.add_playlist("Empty Playlist", "pl-empty", &[]).await?;

    db.clear_search_queue().await?;
    Ok((db, Setup {
        animals, people, cat, dog, momo,
        series_a, series_b, series_c, series_empty,
        video_free0, video_free1, video_a0, video_a1, video_b0, video_b1, video_b2, video_c0,
        playlist_a, playlist_b, playlist_empty,
    }))
}


#[tokio::test(flavor = "multi_thread")]
async fn on_realm_add() -> Result<()> {
    let (db, Setup { cat, .. }) = setup().await?;
    let lili = db.add_realm("Lili", cat, "lili").await?;
    assert_eq!(db.search_queue().await?, set![(lili, IndexItemKind::Realm)]);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_realm_change() -> Result<()> {
    let (db, Setup {
        cat, animals, people, momo, dog,
        video_free0, video_a0, video_a1, video_b2, series_a, series_empty, playlist_b, ..
    }) = setup().await?;

    // Mount series and videos into some realms.
    db.add_video_block(animals, video_free0, 0).await?;
    let cat_series_block = db.add_series_block(cat, series_a, 0).await?;
    db.add_playlist_block(cat, playlist_b, 1).await?;
    db.add_series_block(people, series_empty, 0).await?;
    db.add_series_block(dog, series_empty, 0).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (series_empty, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (video_free0, IndexItemKind::Event),
        (playlist_b, IndexItemKind::Playlist),
        (video_b2, IndexItemKind::Event),

        (animals, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (people, IndexItemKind::Realm),
        (dog, IndexItemKind::Realm),
    ]);


    // Change name of leaf realm without blocks.
    db.clear_search_queue().await?;
    db.execute("update realms set name = 'different' where id = $1", &[&momo]).await?;
    assert_eq!(db.search_queue().await?, set![(momo, IndexItemKind::Realm)]);

    // Change name of realm with series block.
    db.clear_search_queue().await?;
    db.execute("update realms set name = 'different' where id = $1", &[&cat]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (playlist_b, IndexItemKind::Playlist),
        (video_free0, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
    ]);

    // Change name of realm with block and children with blocks
    db.clear_search_queue().await?;
    db.execute("update realms set name = 'different' where id = $1", &[&animals]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (animals, IndexItemKind::Realm),
        (dog, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),      // bc mounted in cat
        (series_empty, IndexItemKind::Series),  // bc mounted in dog
        (video_a0, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_a1, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_free0, IndexItemKind::Event),     // bc mounted in animals
        (playlist_b, IndexItemKind::Playlist),
        (video_b2, IndexItemKind::Event),
    ]);

    // Change name of `people`.
    db.clear_search_queue().await?;
    db.execute("update realms set name = 'different' where id = $1", &[&people]).await?;
    assert_eq!(db.search_queue().await?, set![
        (people, IndexItemKind::Realm),
        (series_empty, IndexItemKind::Series),
    ]);


    // Change to `name_from_block`
    db.clear_search_queue().await?;
    db.execute(
        "update realms set name = null, name_from_block = $2 where id = $1",
        &[&cat, &cat_series_block],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (playlist_b, IndexItemKind::Playlist),
        (video_free0, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
    ]);

    // Change `name_from_block`
    let second_block = db.add_video_block(cat, video_a0, 2).await?;
    db.clear_search_queue().await?;
    db.execute(
        "update realms set name_from_block = $2 where id = $1",
        &[&cat, &second_block],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (playlist_b, IndexItemKind::Playlist),
        (video_free0, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
    ]);


    // Change path (via `path_segment`, but that triggers `full_path` being changes as well).
    // Change name of leaf realm without blocks.
    db.clear_search_queue().await?;
    db.execute("update realms set path_segment = 'different' where id = $1", &[&momo]).await?;
    assert_eq!(db.search_queue().await?, set![(momo, IndexItemKind::Realm)]);

    // Change path segment
    db.clear_search_queue().await?;
    db.execute("update realms set path_segment = 'different' where id = $1", &[&cat]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (playlist_b, IndexItemKind::Playlist),
        (video_free0, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
    ]);

    // Change name of realm with block and children with blocks
    db.clear_search_queue().await?;
    db.execute("update realms set path_segment = 'different' where id = $1", &[&animals]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (animals, IndexItemKind::Realm),
        (dog, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),      // bc mounted in cat
        (series_empty, IndexItemKind::Series),  // bc mounted in dog
        (video_a0, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_a1, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_free0, IndexItemKind::Event),     // bc mounted in animals
        (playlist_b, IndexItemKind::Playlist),
        (video_b2, IndexItemKind::Event),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_realm_remove() -> Result<()> {
    let (db, Setup { cat, momo, people, .. }) = setup().await?;
    db.execute("delete from realms where id = $1", &[&people]).await?;
    assert_eq!(db.search_queue().await?, set![(people, IndexItemKind::Realm)]);

    db.clear_search_queue().await?;
    db.execute("delete from realms where id = $1", &[&cat]).await?;
    assert_eq!(db.search_queue().await?, set![
        (cat, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_event_add() -> Result<()> {
    let (db, Setup { .. }) = setup().await?;
    let event = db.add_event("Foo", 124, "foo", None).await?;
    assert_eq!(db.search_queue().await?, set![(event, IndexItemKind::Event)]);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_event_change() -> Result<()> {
    let (db, Setup { video_a0, series_a, playlist_a, animals, cat, dog, momo, .. }) = setup().await?;

    // Change title without being inside a block.
    db.execute("update events set title = 'different' where id = $1", &[&video_a0]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (playlist_a, IndexItemKind::Playlist),
    ]);

    // Change title while not a name source.
    let block = db.add_video_block(animals, video_a0, 0).await?;
    db.clear_search_queue().await?;
    db.execute("update events set title = 'different2' where id = $1", &[&video_a0]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (playlist_a, IndexItemKind::Playlist),
    ]);

    // Change title while a name source.
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&block, &animals],
    ).await?;
    db.clear_search_queue().await?;
    db.execute("update events set title = 'bonanza' where id = $1", &[&video_a0]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (playlist_a, IndexItemKind::Playlist),
        (animals, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (dog, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);

    // Changing the series of the video.
    db.clear_search_queue().await?;
    db.execute("update events set series = null where id = $1", &[&video_a0]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (playlist_a, IndexItemKind::Playlist),
    ]);

    // Changing duration.
    db.clear_search_queue().await?;
    db.execute("update events set duration = 987 where id = $1", &[&video_a0]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_event_remove() -> Result<()> {
    let (db, Setup { video_a0, series_a, playlist_a, .. }) = setup().await?;
    db.execute("delete from events where id = $1", &[&video_a0]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (playlist_a, IndexItemKind::Playlist),
    ]);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_series_add() -> Result<()> {
    let (db, Setup { .. }) = setup().await?;
    let series = db.add_series("foo", "foo").await?;
    assert_eq!(db.search_queue().await?, set![(series, IndexItemKind::Series)]);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_series_change() -> Result<()> {
    let (db, Setup { series_a, video_a0, video_a1, animals, cat, dog, momo, .. }) = setup().await?;

    // Change title without being inside a block.
    db.execute("update series set title = 'different' where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
    ]);

    // Change title while not a name source.
    let block = db.add_series_block(animals, series_a, 0).await?;
    db.clear_search_queue().await?;
    db.execute("update series set title = 'different2' where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
    ]);

    // Change title while a name source.
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&block, &animals],
    ).await?;
    db.clear_search_queue().await?;
    db.execute("update series set title = 'bonanza' where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (animals, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (dog, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);

    // As does changing other fields.
    db.clear_search_queue().await?;
    db.execute("update series set description = 'henlo' where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        // The videos don't have to be queued, but they currently are and it doesn't really hurt.
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_series_remove() -> Result<()> {
    let (db, Setup {
        series_a, series_empty, video_a0, video_a1, playlist_a, playlist_b, ..
    }) = setup().await?;
    db.execute("delete from series where id = $1", &[&series_empty]).await?;
    assert_eq!(db.search_queue().await?, set![(series_empty, IndexItemKind::Series)]);

    db.clear_search_queue().await?;
    db.execute("delete from series where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
        (playlist_b, IndexItemKind::Playlist),
    ]);
    Ok(())
}


#[tokio::test(flavor = "multi_thread")]
async fn on_playlist_add() -> Result<()> {
    let (db, Setup { video_free1, .. }) = setup().await?;
    let playlist = db.add_playlist("foo", "foo", &[video_free1]).await?;
    assert_eq!(db.search_queue().await?, set![
        (playlist, IndexItemKind::Playlist),
        (video_free1, IndexItemKind::Event),
    ]);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_playlist_change() -> Result<()> {
    let (db, Setup {
        playlist_a, video_a0, video_free0, video_c0, animals, ..
    }) = setup().await?;

    // Change title without being inside a block.
    db.execute("update playlists set title = 'different' where id = $1", &[&playlist_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
        (video_free0, IndexItemKind::Event),
    ]);

    // Change title while not a name source.
    let _block = db.add_playlist_block(animals, playlist_a, 0).await?;
    db.clear_search_queue().await?;
    db.execute("update playlists set title = 'different2' where id = $1", &[&playlist_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
        (video_free0, IndexItemKind::Event),
    ]);

    // TODO: add once possible
    // // Change title while a name source.
    // db.execute(
    //     "update realms set name = null, name_from_block = $1 where id = $2",
    //     &[&block, &animals],
    // ).await?;
    // db.clear_search_queue().await?;
    // db.execute("update playlists set title = 'bonanza' where id = $1", &[&playlist_a]).await?;
    // assert_eq!(db.search_queue().await?, set![
    //     (playlist_a, IndexItemKind::Playlist),
    //     (video_a0, IndexItemKind::Event),
    //     (video_free0, IndexItemKind::Event),
    //     (animals, IndexItemKind::Realm),
    //     (cat, IndexItemKind::Realm),
    //     (dog, IndexItemKind::Realm),
    //     (momo, IndexItemKind::Realm),
    // ]);

    // As does changing other fields.
    db.clear_search_queue().await?;
    db.execute("update playlists set description = 'henlo' where id = $1", &[&playlist_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
        (video_free0, IndexItemKind::Event),
    ]);

    // Add video to playlist
    db.clear_search_queue().await?;
    db.execute("update playlists set entries = array_append(entries, '(123,event,video-c0)') where id = $1", &[&playlist_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
        (video_free0, IndexItemKind::Event),
        (video_c0, IndexItemKind::Event),
    ]);

    // Remove video from playlist
    db.clear_search_queue().await?;
    db.execute("update playlists
        set entries = array['(123,event,video-c0)','(125,event,video-free0)']::playlist_entry[]
        where id = $1",
        &[&playlist_a],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
        (video_free0, IndexItemKind::Event),
        (video_c0, IndexItemKind::Event),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_playlist_remove() -> Result<()> {
    let (db, Setup {
        playlist_a, playlist_empty, video_a0, video_free0, ..
    }) = setup().await?;
    db.execute("delete from playlists where id = $1", &[&playlist_empty]).await?;
    assert_eq!(db.search_queue().await?, set![(playlist_empty, IndexItemKind::Playlist)]);

    db.clear_search_queue().await?;
    db.execute("delete from playlists where id = $1", &[&playlist_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
        (video_free0, IndexItemKind::Event),
    ]);
    Ok(())
}


#[tokio::test(flavor = "multi_thread")]
async fn on_video_block_add_modify_delete() -> Result<()> {
    let (db, Setup {
        cat, momo,
        series_b, series_c,
        playlist_a, playlist_empty,
        video_a0, video_b0, video_b1, video_b2, video_c0, video_free0, video_free1, ..
    }) = setup().await?;

    // Add a video block
    let block = db.add_video_block(cat, video_a0, 0).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (cat, IndexItemKind::Realm),
    ]);

    // Add a few more blocks
    db.add_series_block(cat, series_c, 1).await?;
    db.add_playlist_block(cat, playlist_empty, 2).await?;
    db.add_video_block(momo, video_free0, 0).await?;
    db.add_series_block(momo, series_b, 1).await?;
    db.add_playlist_block(momo, playlist_a, 2).await?;

    // Change `video` field
    db.clear_search_queue().await?;
    db.execute("update blocks set video = $1 where id = $2", &[&video_free1, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event), // old video
        (video_free1, IndexItemKind::Event), // new video

        // Realm and all hosted items
        (cat, IndexItemKind::Realm),
        (series_c, IndexItemKind::Series),
        (video_c0, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),
    ]);

    // Use the block as name source and update title of event.
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&block, &cat],
    ).await?;
    db.clear_search_queue().await?;
    db.execute("update events set title = 'different' where id = $1", &[&video_free1]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_free1, IndexItemKind::Event), // video itself

        // Host realm of that series and all mounted items
        (cat, IndexItemKind::Realm),
        (series_c, IndexItemKind::Series),
        (video_c0, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),

        // Child realm and all hosted items
        (momo, IndexItemKind::Realm),
        (video_free0, IndexItemKind::Event),
        (series_b, IndexItemKind::Series),
        (video_b0, IndexItemKind::Event),
        (video_b1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
    ]);

    // Changing the video of the block used as name source.
    db.clear_search_queue().await?;
    db.execute("update blocks set video = $1 where id = $2", &[&video_a0, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_free1, IndexItemKind::Event), // old video
        (video_a0, IndexItemKind::Event), // new video

        // Host realm of that series and all mounted items
        (cat, IndexItemKind::Realm),
        (series_c, IndexItemKind::Series),
        (video_c0, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),

        // Child realm and all hosted items
        (momo, IndexItemKind::Realm),
        (video_free0, IndexItemKind::Event),
        (series_b, IndexItemKind::Series),
        (video_b0, IndexItemKind::Event),
        (video_b1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
    ]);


    // Changing display settings of the block won't queue anything.
    db.clear_search_queue().await?;
    db.execute("update blocks set show_title = false where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![]);

    // Stop using it as name source.
    db.clear_search_queue().await?;
    db.execute(
        "update realms set name = 'peter', name_from_block = null where id = $1",
        &[&cat],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        // Host realm of that series and all mounted items
        (cat, IndexItemKind::Realm),
        (video_a0, IndexItemKind::Event),
        (series_c, IndexItemKind::Series),
        (video_c0, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),

        // Child realm and all hosted items
        (momo, IndexItemKind::Realm),
        (video_free0, IndexItemKind::Event),
        (series_b, IndexItemKind::Series),
        (video_b0, IndexItemKind::Event),
        (video_b1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
    ]);

    // Delete block
    db.clear_search_queue().await?;
    db.execute("delete from blocks where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event), // video itself

        // Host realm of that series and all mounted items
        (cat, IndexItemKind::Realm),
        (series_c, IndexItemKind::Series),
        (video_c0, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_series_block_add_modify_delete() -> Result<()> {
    let (db, Setup {
        cat, momo,
        series_a, series_b, series_empty,
        playlist_a, playlist_empty,
        video_a0, video_a1, video_b0, video_b1, video_b2, video_c0, video_free0, ..
    }) = setup().await?;

    // Add a series block -> the series, all its videos and the realm are now listed.
    let block = db.add_series_block(cat, series_a, 0).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (cat, IndexItemKind::Realm),
    ]);

    // Add a few more blocks
    db.add_video_block(cat, video_c0, 1).await?;
    db.add_playlist_block(cat, playlist_empty, 2).await?;
    db.add_video_block(momo, video_free0, 0).await?;
    db.add_series_block(momo, series_b, 1).await?;
    db.add_playlist_block(momo, playlist_a, 2).await?;


    // Change `series` field
    db.clear_search_queue().await?;
    db.execute("update blocks set series = $1 where id = $2", &[&series_empty, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        // Old series & videos
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),

        // New series
        (series_empty, IndexItemKind::Series),

        // Realm and all hosted items
        (cat, IndexItemKind::Realm),
        (video_c0, IndexItemKind::Event), // Also mounted on realm
        (playlist_empty, IndexItemKind::Playlist),
    ]);

    // Use block as name source & update title of series.
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&block, &cat],
    ).await?;
    db.clear_search_queue().await?;
    db.execute("update series set title = 'different' where id = $1", &[&series_empty]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_empty, IndexItemKind::Series), // series itself

        // Host realm of that series and all mounted items
        (cat, IndexItemKind::Realm),
        (video_c0, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),

        // Child realm and all hosted items
        (momo, IndexItemKind::Realm),
        (video_free0, IndexItemKind::Event),
        (series_b, IndexItemKind::Series),
        (video_b0, IndexItemKind::Event),
        (video_b1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
    ]);

    // Changing the series of the name source block.
    db.clear_search_queue().await?;
    db.execute("update blocks set series = $1 where id = $2", &[&series_a, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_empty, IndexItemKind::Series), // old series

        // New series and its events
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),

        // Host realm of that series and all mounted items
        (cat, IndexItemKind::Realm),
        (video_c0, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),

        // Child realm and all hosted items
        (momo, IndexItemKind::Realm),
        (video_free0, IndexItemKind::Event),
        (series_b, IndexItemKind::Series),
        (video_b0, IndexItemKind::Event),
        (video_b1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
    ]);


    // Changing display settings of the block won't queue anything.
    db.clear_search_queue().await?;
    db.execute("update blocks set show_title = false where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![]);

    // Stop using it as name source.
    db.clear_search_queue().await?;
    db.execute(
        "update realms set name = 'peter', name_from_block = null where id = $1",
        &[&cat],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        // Affected realm and all mounted items
        (cat, IndexItemKind::Realm),
        (video_c0, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (playlist_empty, IndexItemKind::Playlist),

        // Child realm and all hosted items
        (momo, IndexItemKind::Realm),
        (video_free0, IndexItemKind::Event),
        (series_b, IndexItemKind::Series),
        (video_b0, IndexItemKind::Event),
        (video_b1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_a, IndexItemKind::Playlist),
        (video_a0, IndexItemKind::Event),
    ]);

    // Delete block
    db.clear_search_queue().await?;
    db.execute("delete from blocks where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (cat, IndexItemKind::Realm),
        (video_c0, IndexItemKind::Event),
        (video_a0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (playlist_empty, IndexItemKind::Playlist),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_playlist_block_add_modify_delete() -> Result<()> {
    let (db, Setup {
        cat, momo,
        series_b, series_empty,
        playlist_a, playlist_b, playlist_empty,
        video_a0, video_a1, video_b2, video_c0, video_free0, ..
    }) = setup().await?;

    // Add a playlist block -> the playlist, all its videos and the realm are now listed.
    let block = db.add_playlist_block(cat, playlist_b, 0).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_free0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_b, IndexItemKind::Playlist),
        (cat, IndexItemKind::Realm),
    ]);

    // Add a few more blocks
    db.add_video_block(cat, video_c0, 1).await?;
    db.add_series_block(cat, series_empty, 2).await?;
    db.add_video_block(momo, video_free0, 0).await?;
    db.add_series_block(momo, series_b, 1).await?;
    db.add_playlist_block(momo, playlist_empty, 2).await?;


    // Change `playlist` field
    db.clear_search_queue().await?;
    db.execute("update blocks set playlist = $1 where id = $2", &[&playlist_a, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        // Old playlist & videos
        (video_free0, IndexItemKind::Event),
        (video_a1, IndexItemKind::Event),
        (video_b2, IndexItemKind::Event),
        (playlist_b, IndexItemKind::Playlist),

        // New playlist and videos
        (playlist_a, IndexItemKind::Playlist),
        (video_free0, IndexItemKind::Event),
        (video_a0, IndexItemKind::Event),

        // Realm and all hosted items
        (cat, IndexItemKind::Realm),
        (video_c0, IndexItemKind::Event), // Also mounted on realm
        (series_empty, IndexItemKind::Series),
    ]);

    // TODO: use playlist as name source

    // Changing display settings of the block won't queue anything.
    db.clear_search_queue().await?;
    db.execute("update blocks set show_title = false where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![]);

    // Delete block
    db.clear_search_queue().await?;
    db.execute("delete from blocks where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (cat, IndexItemKind::Realm),
        (playlist_a, IndexItemKind::Playlist),
        (video_free0, IndexItemKind::Event),
        (video_a0, IndexItemKind::Event),

        (video_c0, IndexItemKind::Event),
        (series_empty, IndexItemKind::Series),
    ]);

    Ok(())
}
