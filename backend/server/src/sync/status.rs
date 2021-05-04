use chrono::{DateTime, NaiveDateTime, Utc};

use tobira_util::prelude::*;
use tokio_postgres::GenericClient;


/// Stored in the database to keep track of the Opencast <-> Tobira sync. For
/// more information, see the DB migration script.
pub(super) struct SyncStatus {
    pub(super) harvested_until: DateTime<Utc>,
}

impl SyncStatus {
    /// Fetches that information from the DB.
    pub(super) async fn fetch(db: &impl GenericClient) -> Result<Self> {
        let row = db.query_one("select harvested_until from sync_status", &[]).await?;

        Ok(Self {
            harvested_until: DateTime::from_utc(row.get::<_, NaiveDateTime>(0), Utc),
        })
    }

    /// Write a new value for `harvested_until` into the database.
    pub(super) async fn update_harvested_until(
        new_value: DateTime<Utc>,
        db: &impl GenericClient,
    ) -> Result<()> {
        db.execute(
            "update sync_status set harvested_until = $1",
            &[&new_value.naive_utc()],
        ).await?;

        Ok(())
    }
}
