use std::{sync::atomic::{AtomicU32, Ordering}, time::Duration};
use postgres_types::{BorrowToSql, ToSql};
use tokio_postgres::{Error, Row, RowStream};

use crate::prelude::*;
use super::{DbConnection, util::collect_rows_mapped};


/// A database transaction that has been started for one API request.
///
/// We don't use the `Transaction` type from `tokio_postgres` or
/// `deadpool_postgres` as that carries a lifetime parameter and borrows the
/// actual client. But this transaction needs to live in the API context, which
/// has to be 'static. We just issue the SQL commands ourselves.
///
/// Like `tokio_postgres::Transaction`, it is rolled back when dropped without
/// calling `commit` or `rollback`.
pub struct Transaction {
    /// `None` once the transaction is finished.
    client: Option<DbConnection>,
    num_queries: AtomicU32,
}

impl Transaction {
    /// Starts a new transaction on the given connection.
    pub async fn begin(client: DbConnection) -> Result<Self, Error> {
        // We create `Self` before sending `start transaction` so that the
        // `Drop` impl rolls back if this future is dropped after the
        // statement was sent but before it completed. Otherwise, a connection
        // in an open transaction could be returned to the pool.
        let tx = Self {
            client: Some(client),
            num_queries: AtomicU32::new(0),
        };
        tx.client().batch_execute("start transaction").await?;
        Ok(tx)
    }

    /// Consumes the transaction, committing all changes made within it.
    pub async fn commit(mut self) -> Result<(), Error> {
        let client = self.client.take().expect("transaction already finished");
        client.batch_execute("commit").await
    }

    /// Rolls the transaction back, discarding all changes made within it.
    pub async fn rollback(mut self) -> Result<(), Error> {
        let client = self.client.take().expect("transaction already finished");
        client.batch_execute("rollback").await
    }

    fn client(&self) -> &DbConnection {
        self.client.as_ref().expect("transaction already finished")
    }

    pub fn num_queries(&self) -> u32 {
        self.num_queries.load(Ordering::SeqCst)
    }

    fn increase_num_queries(&self) {
        // `Relaxed` would probably be fine for these metrics.
        self.num_queries.fetch_add(1, Ordering::SeqCst);
    }

    pub fn inner(&self) -> &impl deadpool_postgres::GenericClient {
        self.client()
    }

    // The following methods shadow the ones from `deadpool_postgres::Transaction`
    // and automatically use the statement cache. This means every query
    // additionally incurs an `RwLock` read lock and a hashmap lookup, but
    // that's a lot cheaper than preparing the statement each time (which is
    // what happens when executing unprepared statements).
    //
    // We could avoid the `RwLock`/hashmap stuff by preparing all queries our
    // application will ever use whenever we check out a new DB connection.
    // However, this would mean a lot more code which contains logic
    // duplications. This makes everything a lot less maintainable. Thus
    // automatically using the statement cache is the best solution.

    pub async fn query_one(
        &self,
        query: &str,
        params: &[&(dyn ToSql + Sync)],
    ) -> Result<Row, Error> {
        trace!(query, ?params, "Executing SQL query");
        let statement = self.client().prepare_cached(query).await?;
        self.increase_num_queries();
        self.client().query_one(&statement, params).await
    }

    pub async fn query_opt(
        &self,
        query: &str,
        params: &[&(dyn ToSql + Sync)],
    ) -> Result<Option<Row>, Error> {
        trace!(query, ?params, "Executing SQL query");
        let statement = self.client().prepare_cached(query).await?;
        self.increase_num_queries();
        self.client().query_opt(&statement, params).await
    }

    pub async fn query_raw<P, I>(&self, query: &str, params: I) -> Result<RowStream, Error>
    where
        P: BorrowToSql,
        I: IntoIterator<Item = P> + std::fmt::Debug,
        I::IntoIter: ExactSizeIterator,
    {
        trace!(query, ?params, "Executing SQL query");
        let statement = self.client().prepare_cached(query).await?;
        self.increase_num_queries();
        self.client().query_raw(&statement, params).await
    }

    /// Convenience method to query many rows and convert each row to a specific
    /// type with `from_row`.
    pub async fn query_mapped<P, I, F, T>(
        &self,
        query: &str,
        params: I,
        from_row: F,
    ) -> Result<Vec<T>, Error>
    where
        P: BorrowToSql,
        I: IntoIterator<Item = P> + std::fmt::Debug,
        I::IntoIter: ExactSizeIterator,
        F: FnMut(Row) -> T,
    {
        collect_rows_mapped(self.query_raw(query, params), from_row).await
    }

    pub async fn execute(
        &self,
        query: &str,
        params: &[&(dyn ToSql + Sync)],
    ) -> Result<u64, Error> {
        trace!(query, ?params, "Executing SQL query");
        let statement = self.client().prepare_cached(query).await?;
        self.increase_num_queries();
        self.client().execute(&statement, params).await
    }
}

impl Drop for Transaction {
    fn drop(&mut self) {
        // If not finished (e.g. on panic or when the request future is
        // dropped), we roll back in a background task. If that fails or times
        // out, we close the connection instead of returning it to the pool in
        // an unknown state. The timeout is generous since `rollback` might
        // have to wait for a query still running on this connection. Closing
        // early would not stop that query in Postgres, but would free the pool
        // slot, so the number of DB connections would no longer be bounded.
        //
        // There is a better option, which is unfortunately a private API of
        // `tokio-postgres`: `__private_api_rollback`
        // See https://github.com/rust-postgres/rust-postgres/pull/1230
        if let Some(client) = self.client.take() {
            tokio::spawn(async move {
                let rollback = client.batch_execute("rollback");
                let res = tokio::time::timeout(Duration::from_secs(10), rollback).await;
                if !matches!(res, Ok(Ok(()))) {
                    drop(deadpool::managed::Object::take(client));
                }
            });
        }
    }
}
