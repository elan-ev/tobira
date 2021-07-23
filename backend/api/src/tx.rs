use std::{ops::Deref, sync::Arc};


/// A database transaction that has been started for one API request.
pub struct Transaction {
    inner: Arc<deadpool_postgres::Transaction<'static>>,
}

impl Transaction {
    pub fn new(inner: Arc<deadpool_postgres::Transaction<'static>>) -> Self {
        Self { inner }
    }
}

impl Deref for Transaction {
    type Target = deadpool_postgres::Transaction<'static>;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}
