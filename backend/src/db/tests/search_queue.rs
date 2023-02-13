use crate::{prelude::*, db::types::Key, search::IndexItemKind};
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
    video_free: Key,
    video_a: Key,
    video_b: Key,
    series_a: Key,
    series_empty: Key,
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

    let animals = db.add_realm("animals", Key(0), "animals").await?;
    let people = db.add_realm("people", Key(0), "people").await?;
    let cat = db.add_realm("cat", animals, "cat").await?;
    let dog = db.add_realm("dog", animals, "dog").await?;
    let momo = db.add_realm("momo", cat, "momo").await?;

    let series_a = db.add_series("Empty", "series-empty").await?;
    let series_empty = db.add_series("Non empty", "series-non-empty").await?;
    let video_free = db.add_event("Lonely", 123, "lonely-123", None).await?;
    let video_a = db.add_event("Video A", 60, "video-a", Some(series_a)).await?;
    let video_b = db.add_event("Video B", 80, "video-b", Some(series_a)).await?;

    db.clear_search_queue().await?;
    Ok((db, Setup {
        animals, people, cat, dog, momo, video_free, video_a, video_b, series_a, series_empty,
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
        cat, animals, people, momo, dog, video_free, video_a, video_b, series_a, series_empty, ..
    }) = setup().await?;

    // Mount series and videos into some realms.
    db.add_video_block(animals, video_free, 0).await?;
    let cat_series_block = db.add_series_block(cat, series_a, 0).await?;
    db.add_series_block(people, series_empty, 0).await?;
    db.add_series_block(dog, series_empty, 0).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (series_empty, IndexItemKind::Series),
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (video_free, IndexItemKind::Event),
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
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
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
        (video_a, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_b, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_free, IndexItemKind::Event),     // bc mounted in animals
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
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
    ]);

    // Change `name_from_block`
    let second_block = db.add_video_block(cat, video_a, 1).await?;
    db.clear_search_queue().await?;
    db.execute(
        "update realms set name_from_block = $2 where id = $1",
        &[&cat, &second_block],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
    ]);


    // Change path (via `path_segment`, but that triggers `full_path` being changes as well).
    // Change name of leaf realm without blocks.
    db.clear_search_queue().await?;
    db.execute("update realms set path_segment = 'different' where id = $1", &[&momo]).await?;
    assert_eq!(db.search_queue().await?, set![(momo, IndexItemKind::Realm)]);

    // Change name of realm with series block.
    db.clear_search_queue().await?;
    db.execute("update realms set path_segment = 'different' where id = $1", &[&cat]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series_a, IndexItemKind::Series),
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
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
        (video_a, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_b, IndexItemKind::Event),        // bc in series_a which is mounted in cat
        (video_free, IndexItemKind::Event),     // bc mounted in animals
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
    let (db, Setup { video_a, animals, cat, dog, momo, .. }) = setup().await?;

    // Change title without being inside a block.
    db.execute("update events set title = 'different' where id = $1", &[&video_a]).await?;
    assert_eq!(db.search_queue().await?, set![(video_a, IndexItemKind::Event)]);

    // Change title while not a name source.
    let block = db.add_video_block(animals, video_a, 0).await?;
    db.clear_search_queue().await?;
    db.execute("update events set title = 'different2' where id = $1", &[&video_a]).await?;
    assert_eq!(db.search_queue().await?, set![(video_a, IndexItemKind::Event)]);

    // Change title while a name source.
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&block, &animals],
    ).await?;
    db.clear_search_queue().await?;
    db.execute("update events set title = 'bonanza' where id = $1", &[&video_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (animals, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (dog, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);

    // Changing the series just queues the video.
    db.clear_search_queue().await?;
    db.execute("update events set series = null where id = $1", &[&video_a]).await?;
    assert_eq!(db.search_queue().await?, set![(video_a, IndexItemKind::Event)]);

    // As does changing other fields.
    db.clear_search_queue().await?;
    db.execute("update events set duration = 987 where id = $1", &[&video_a]).await?;
    assert_eq!(db.search_queue().await?, set![(video_a, IndexItemKind::Event)]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_event_remove() -> Result<()> {
    let (db, Setup { video_a, .. }) = setup().await?;
    db.execute("delete from events where id = $1", &[&video_a]).await?;
    assert_eq!(db.search_queue().await?, set![(video_a, IndexItemKind::Event)]);
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
    let (db, Setup { series_a, video_a, video_b, animals, cat, dog, momo, .. }) = setup().await?;

    // Change title without being inside a block.
    db.execute("update series set title = 'different' where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
    ]);

    // Change title while not a name source.
    let block = db.add_series_block(animals, series_a, 0).await?;
    db.clear_search_queue().await?;
    db.execute("update series set title = 'different2' where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
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
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
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
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_series_remove() -> Result<()> {
    let (db, Setup { series_a, series_empty, video_a, video_b, .. }) = setup().await?;
    db.execute("delete from series where id = $1", &[&series_empty]).await?;
    assert_eq!(db.search_queue().await?, set![(series_empty, IndexItemKind::Series)]);

    db.clear_search_queue().await?;
    db.execute("delete from series where id = $1", &[&series_a]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_a, IndexItemKind::Series),
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
    ]);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_video_block_add_modify_delete() -> Result<()> {
    let (db, Setup { cat, series_a, video_a, video_b, video_free, momo, .. }) = setup().await?;

    // Add a video block -> the series and all its videos are now listed.
    let block = db.add_video_block(cat, video_a, 0).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
    ]);

    // Change `video` field: listed status changes.
    db.clear_search_queue().await?;
    db.execute("update blocks set video = $1 where id = $2", &[&video_free, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (video_free, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
    ]);

    // When the block is used as name source, and the title of the event is
    // updated, the realms are queued.
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&block, &cat],
    ).await?;
    db.clear_search_queue().await?;
    db.execute("update events set title = 'different' where id = $1", &[&video_free]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_free, IndexItemKind::Event),
        (cat, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);

    // Changing the video of the block also queues the realms as the name is retrieved from it.
    db.clear_search_queue().await?;
    db.execute("update blocks set video = $1 where id = $2", &[&video_a, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (video_free, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (cat, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
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
        (video_a, IndexItemKind::Event),
        (cat, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);

    // Delete block
    db.clear_search_queue().await?;
    db.execute("delete from blocks where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
    ]);

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn on_series_block_add_modify_delete() -> Result<()> {
    let (db, Setup { cat, series_a, series_empty, video_a, video_b, momo, .. }) = setup().await?;

    // Add a series block -> the series and all its videos are now listed.
    let block = db.add_series_block(cat, series_a, 0).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
    ]);

    // Change `series` field: listed status changes.
    db.clear_search_queue().await?;
    db.execute("update blocks set series = $1 where id = $2", &[&series_empty, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (series_empty, IndexItemKind::Series),
    ]);

    // When the block is used as name source, and the title of the series is
    // updated, the realms are queued.
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&block, &cat],
    ).await?;
    db.clear_search_queue().await?;
    db.execute("update series set title = 'different' where id = $1", &[&series_empty]).await?;
    assert_eq!(db.search_queue().await?, set![
        (series_empty, IndexItemKind::Series),
        (cat, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);

    // Changing the video of the block also queues the realms as the name is retrieved from it.
    db.clear_search_queue().await?;
    db.execute("update blocks set series = $1 where id = $2", &[&series_a, &block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
        (series_empty, IndexItemKind::Series),
        (cat, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
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
        (cat, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
    ]);

    // Delete block
    db.clear_search_queue().await?;
    db.execute("delete from blocks where id = $1", &[&block]).await?;
    assert_eq!(db.search_queue().await?, set![
        (video_a, IndexItemKind::Event),
        (video_b, IndexItemKind::Event),
        (series_a, IndexItemKind::Series),
    ]);

    Ok(())
}
