use std::{ops::Deref, sync::{Arc, atomic::{AtomicU32, Ordering}}};
use postgres_types::{BorrowToSql, ToSql};
use tokio_postgres::{Error, Row, RowStream};

use crate::prelude::*;


/// A database transaction that has been started for one API request.
pub struct Transaction {
    inner: Arc<deadpool_postgres::Transaction<'static>>,
    num_queries: AtomicU32,
}

impl Transaction {
    pub fn new(inner: Arc<deadpool_postgres::Transaction<'static>>) -> Self {
        Self { inner, num_queries: AtomicU32::new(0) }
    }

    pub fn num_queries(&self) -> u32 {
        self.num_queries.load(Ordering::SeqCst)
    }

    fn increase_num_queries(&self) {
        // `Relaxed` would probably be fine for these metrics.
        self.num_queries.fetch_add(1, Ordering::SeqCst);
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
        trace!("Executing SQL query: \"{}\" with {:?}", query, params);
        let statement = self.inner.prepare_cached(query).await?;
        self.increase_num_queries();
        self.inner.query_one(&statement, params).await
    }

    pub async fn query_opt(
        &self,
        query: &str,
        params: &[&(dyn ToSql + Sync)],
    ) -> Result<Option<Row>, Error> {
        trace!("Executing SQL query: \"{}\" with {:?}", query, params);
        let statement = self.inner.prepare_cached(query).await?;
        self.increase_num_queries();
        self.inner.query_opt(&statement, params).await
    }

    pub async fn query_raw<P, I>(&self, query: &str, params: I) -> Result<RowStream, Error>
    where
        P: BorrowToSql,
        I: IntoIterator<Item = P> + std::fmt::Debug,
        I::IntoIter: ExactSizeIterator,
    {
        trace!("Executing SQL query: \"{}\" with {:?}", query, params);
        let statement = self.inner.prepare_cached(query).await?;
        self.increase_num_queries();
        self.inner.query_raw(&statement, params).await
    }

    pub async fn execute(
        &self,
        query: &str,
        params: &[&(dyn ToSql + Sync)],
    ) -> Result<u64, Error> {
        trace!("Executing SQL query: \"{}\" with {:?}", query, params);
        let statement = self.inner.prepare_cached(query).await?;
        self.increase_num_queries();
        self.inner.execute(&statement, params).await
    }
}

impl Deref for Transaction {
    type Target = deadpool_postgres::Transaction<'static>;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}
