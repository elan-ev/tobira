use std::{time::Duration, future::Future, pin::Pin};

use deadpool_postgres::ClientWrapper;
use tokio_postgres::IsolationLevel;

use crate::prelude::*;

use super::Client;


/// Wrapper around our Meili client that states that write operations are
/// allowed. Write-related methods can be added to this type. Of course, write
/// operations *could* also be performed through our normal client, this is
/// just a bit of non-enforced semantic typing.
pub(crate) struct MeiliWriter<'a>(&'a Client);

impl<'a> MeiliWriter<'a> {
    /// Create a `MeiliWriter` without acquiring an exclusive lock first.
    /// This should only be used when you are absolutely sure this is okay to do,
    /// i.e. when concurrent access during your operation is either irrelevant
    /// or not expected.
    pub(crate) fn without_lock(client: &'a Client) -> Self {
        Self(client)
    }
}

impl std::ops::Deref for MeiliWriter<'_> {
    type Target = Client;
    fn deref(&self) -> &Self::Target {
        self.0
    }
}


/// Used to modify any search indexes by acquiring an exclusive DB lock to avoid
/// multiple processes writing to the index at the same time.
///
/// Important: for this to work properly, `f` MUST NOT send any data to the
/// search index that is not already in the DB before `f` was called. `f` is
/// allowed to modify the database, but only data that is not reflected in the
/// search index at all. For example, it is fine to delete entries from
/// `search_index_queue` (this is basically the only useful write operation to
/// the DB that `f` might do). But it is not OK for `f` to insert new data into
/// the DB and then also send it to Meili.
///
/// The reason for this is that all writes to the `DB` could still fail and be
/// rolled back. And we never want to end up in a situation where the index has
/// data the DB does not have.
///
/// In addition to being semantically/logically tricky, writing this in Rust is
/// also a bit tricky. In short: accepting a closure returning a Future that
/// references a reference-type argument is hard to impossible to implement
/// right now. It's sad. After testing quite a few things, I decided to simply go
/// with a `dyn Future`.
pub(crate) async fn with_write_lock<F, T>(db: &mut ClientWrapper, meili: &Client, f: F) -> Result<T>
where
    F: for<'a> FnOnce(&'a deadpool_postgres::Transaction<'a>, MeiliWriter<'a>)
        -> Pin<Box<dyn 'a + Future<Output = Result<T>>>>,
{
    // For table locks, we need to be in a transaction. The transaction should
    // be serializable to ensure consistency between separate queries in it.
    let tx = db.build_transaction()
        .isolation_level(IsolationLevel::Serializable)
        .start()
        .await?;

    // Next, we lock the `search_index_queue` table. We use this as a
    // cross-process mutex basically: the locking is *not* required for
    // operations within PostgreSQL! Instead, it is used to coordinate *other*
    // things outside of PG, in particular, sending data to the search index.
    //
    // We use the lock mode "share update exclusive" because:
    // - It does conflict with itself, so we can use it as an "exclusive lock"
    //   for getting a "permission" to write to the search index. Only one
    //   process can hold a "share update exclusive" lock at any given point in
    //   time.
    // - It does NOT conflict with "row exclusive", which is required to insert
    //   new rows into the table. So other processes can happily push new items
    //   to the queue.
    //
    //
    //
    // We want to log a message if we cannot acquire the lock right away. This
    // is achieved by the `spawn` and `abort`.
    let print_notice = tokio::spawn(async {
        tokio::time::sleep(Duration::from_millis(500)).await;
        warn!("Could not acquire write access to search index immediately. Waiting for lock...");
    });
    trace!("Attempting to lock table 'search_index_queue'...");
    let res = tx.execute("lock table search_index_queue in share update exclusive mode", &[]).await;
    print_notice.abort();
    res.context("failed to lock table 'search_index_queue'")?;
    trace!("Locked table 'search_index_queue'");

    // At this point we acquire the table lock, meaning that we are the only
    // process in possession of it. We can start modifying search index data
    // now. If that fails, we early exit, which will cause the transaction to
    // rollback and the lock to be released. Rolling back the transaction is
    // important as `f` could have marked some things as "properly sent to
    // index", which might not be true.
    //
    // On the other hand, if data is already sent to the search index, but
    // writing this fact to the DB fails, we are fine. This just means that
    // next time around, we will send the same data to the search index again.
    // Which is wasted computing power, yes, but does not change or corrupt any
    // data.
    let out = f(&tx, MeiliWriter(meili)).await?;

    // Try to commit the transaction. With the same argument as above, and
    // thanks to the requirements of `f`, failing to commit here is not bad. It
    // does not lead to data inconsistencies.
    trace!("Attempting to commit index writing transaction (and release table lock)...");
    if let Err(e) = tx.commit().await {
        warn!("Failed to commit transaction for index update: {e}");
    }

    Ok(out)
}
