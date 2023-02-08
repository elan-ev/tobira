use crate::{prelude::*, db::types::Key, search::IndexItemKind};
use super::DbConfig;
use self::util::TestDb;

mod util;

macro_rules! set {
    ($($e:expr),* $(,)?) => {
        std::collections::HashSet::from([$($e),*])
    };
}

#[tokio::test(flavor = "multi_thread")]
async fn root_realm_exists() -> Result<()> {
    let db = TestDb::with_migrations().await?;
    let row = db.query_one("select * from realms", &[]).await?;
    assert_eq!(row.get::<_, Key>("id"), Key(0));
    assert_eq!(row.get::<_, String>("path_segment"), "");
    assert_eq!(row.get::<_, String>("full_path"), "");

    Ok(())
}

// Makes sure realms are correctly inserted into the search queue.
#[tokio::test(flavor = "multi_thread")]
async fn realm_search_queue_triggers() -> Result<()> {
    let db = TestDb::with_migrations().await?;

    // Insert some realms and always make sure they are also in the queue. In
    // the end we will have this realm tree:
    //
    // - animals
    //   - dog
    //   - cat
    //     - momo
    // - people
    let animals = db.add_realm("animals", Key(0), "animals").await?;
    let people = db.add_realm("people", Key(0), "people").await?;
    let cat = db.add_realm("cat", animals, "cat").await?;
    assert_eq!(db.search_queue().await?, set![
        (animals, IndexItemKind::Realm),
        (people, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
    ]);

    // Make sure that parent realms are not queued when adding child realms.
    db.clear_search_queue().await?;
    let dog = db.add_realm("dog", animals, "dog").await?;
    let momo = db.add_realm("momo", cat, "momo").await?;
    assert_eq!(db.search_queue().await?, set![
        (dog, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);

    // Make sure the parent is not queued when the child name changes.
    db.clear_search_queue().await?;
    db.execute("update realms set name = 'Momomo' where id = $1", &[&momo]).await?;
    assert_eq!(db.search_queue().await?, set![(momo, IndexItemKind::Realm)]);

    // Make sure the child realms are queued when a parent name is modified.
    db.clear_search_queue().await?;
    db.execute("update realms set name = 'Tiere' where id = $1", &[&animals]).await?;
    assert_eq!(db.search_queue().await?, set![
        (animals, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (dog, IndexItemKind::Realm),
        (momo, IndexItemKind::Realm),
    ]);


    // Create an event and a block for it. It will queue the event but not the
    // realm.
    db.clear_search_queue().await?;
    let event = db.add_event("foo", 123, "foo").await?;
    let video_block = db.query_one(
        "insert into blocks (realm, index, type, video, show_title)
            values ($1, 0, 'video', $2, true)
            returning id",
        &[&cat, &event],
    ).await?.get::<_, Key>(0);
    assert_eq!(db.search_queue().await?, set![(event, IndexItemKind::Event)]);

    // Make sure if the name of the video is changed without being used as a
    // name source block, it won't queue the realms.
    db.clear_search_queue().await?;
    db.execute("update events set title = 'bar' where id = $1", &[&event]).await?;
    assert_eq!(db.search_queue().await?, set![(event, IndexItemKind::Event)]);

    // Make sure when we set the realm to derive its name from the video block, it is queued.
    db.clear_search_queue().await?;
    db.execute(
        "update realms set name = null, name_from_block = $1 where id = $2",
        &[&video_block, &cat],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (event, IndexItemKind::Event),
    ]);

    // Make sure if the event's title is changed, the affected realms are queued too.
    db.clear_search_queue().await?;
    db.execute("update events set title = 'banana' where id = $1", &[&event]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (event, IndexItemKind::Event),
    ]);


    // Add series and corresponding block.
    db.clear_search_queue().await?;
    let series = db.add_series("green", "green").await?;
    let series_block = db.query_one(
        "insert into blocks (realm, index, type, series, show_title, videolist_order)
            values ($1, 1, 'series', $2, true, 'new_to_old')
            returning id",
        &[&cat, &series],
    ).await?.get::<_, Key>(0);
    assert_eq!(db.search_queue().await?, set![(series, IndexItemKind::Series)]);

    // Make sure if the name of the series is changed without being used as a
    // name source block, it won't queue the realms.
    db.clear_search_queue().await?;
    db.execute("update series set title = 'blue' where id = $1", &[&series]).await?;
    assert_eq!(db.search_queue().await?, set![(series, IndexItemKind::Series)]);

    // Make sure when we set the realm to derive its name from the series block,
    // it is queued. The series and event included are queued as well.
    db.clear_search_queue().await?;
    db.execute(
        "update realms set name_from_block = $1 where id = $2",
        &[&series_block, &cat],
    ).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series, IndexItemKind::Series),
        (event, IndexItemKind::Event),
    ]);

    // Make sure if the series' title is changed, everything is queued as above.
    db.clear_search_queue().await?;
    db.execute("update series set title = 'kiwi' where id = $1", &[&series]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series, IndexItemKind::Series),
        (event, IndexItemKind::Event),
    ]);


    // Finally, if a realm is deleted, it and all its deleted children need to
    // be queued.
    db.clear_search_queue().await?;
    db.execute("delete from realms where id = $1", &[&cat]).await?;
    assert_eq!(db.search_queue().await?, set![
        (momo, IndexItemKind::Realm),
        (cat, IndexItemKind::Realm),
        (series, IndexItemKind::Series),
        (event, IndexItemKind::Event),
    ]);

    Ok(())
}
