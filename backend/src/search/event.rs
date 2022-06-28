use chrono::{DateTime, Utc};
use deadpool_postgres::Transaction;
use meilisearch_sdk::{document::Document, tasks::Task, indexes::Index};
use serde::{Serialize, Deserialize};
use tokio_postgres::{Row, GenericClient};

use crate::{
    prelude::*,
    db::{types::Key, util::collect_rows_mapped},
};

use super::{realm::Realm, Client, SearchId, IndexItem, IndexItemKind, util};



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Event {
    pub(crate) id: SearchId,
    pub(crate) series_id: Option<SearchId>,
    pub(crate) series_title: Option<String>,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) creators: Vec<String>,
    pub(crate) thumbnail: Option<String>,
    pub(crate) duration: i32,
    pub(crate) created: DateTime<Utc>,
    pub(crate) is_live: bool,

    // These are filterable. All roles are hex encoded to work around Meilis
    // inability to filter case-sensitively. For roles, we have to compare
    // case-sensitively. Encoding as hex is one possibility. There likely also
    // exists a more compact encoding, but hex is good for now.
    //
    // Alternatively, one could also let Meili do the case-insensitive checking
    // and do another check in our backend, case-sensitive. That could work if
    // we just assume that the cases where this matters are very rare. And in
    // those cases we just accept that our endpoint returns fewer than X
    // items.
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,

    // The `listed` field is always `!host_realms.is_empty()`, but we need to
    // store it explicitly to filter for this condition in Meili.
    pub(crate) listed: bool,
    pub(crate) host_realms: Vec<Realm>,
}

impl Document for Event {
   type UIDType = SearchId;
   fn get_uid(&self) -> &Self::UIDType {
       &self.id
   }
}

impl IndexItem for Event {
    const KIND: IndexItemKind = IndexItemKind::Event;
}

impl Event {
    const SQL_SELECT_FIELDS: &'static str = "\
        events.id, \
        events.series, series.title, \
        events.title, events.description, events.creators, \
        events.thumbnail, events.duration, \
        events.is_live, events.created, \
        events.read_roles, events.write_roles, \
        coalesce( \
            array_agg( \
                json_build_object( \
                    'id', realms.id::text, \
                    'name', name, \
                    'full_path', full_path, \
                    'ancestor_names', array( \
                        select name from ancestors_of_realm(realms.id) \
                        where height <> 0 offset 1 \
                    ) \
                ) \
            ) filter(where realms.id is not null), \
            '{}' \
        ) as host_realms \
    ";

    fn sql_query(where_clause: &str) -> String {
        let cols = Self::SQL_SELECT_FIELDS;
        format!(
            "select {cols} \
                from events \
                left join series on events.series = series.id \
                left join realms on exists ( \
                    select true as includes from blocks \
                    where realms.id = realm_id and ( \
                        type = 'series' and series_id = events.series \
                        or type = 'video' and video_id = events.id \
                    ) \
                ) \
                {where_clause} \
                group by events.id, series.id",
        )
    }

    /// Converts a row to `Self` when the query selected `SQL_SELECT_FIELDS`.
    fn from_row(row: Row) -> Self {
        let host_realms = row.get::<_, Vec<serde_json::Value>>(12);
        Self {
            id: SearchId(row.get(0)),
            series_id: row.get::<_, Option<Key>>(1).map(SearchId),
            series_title: row.get(2),
            title: row.get(3),
            description: row.get(4),
            creators: row.get(5),
            thumbnail: row.get(6),
            duration: row.get(7),
            is_live: row.get(8),
            created: row.get(9),
            read_roles: util::encode_acl(&row.get::<_, Vec<String>>(10)),
            write_roles: util::encode_acl(&row.get::<_, Vec<String>>(11)),
            listed: !host_realms.is_empty(),
            host_realms: host_realms.into_iter()
                .map(|host_realm| Realm {
                    id: SearchId(Key(
                        host_realm["id"]
                            .as_str().unwrap()
                            .parse::<i64>().unwrap() as u64,
                    )),
                    name: host_realm["name"].as_str().unwrap().into(),
                    full_path: host_realm["full_path"].as_str().unwrap().into(),
                    ancestor_names: host_realm["ancestor_names"].as_array().unwrap()
                        .into_iter()
                        .map(|name| name.as_str().unwrap().into())
                        .collect(),
                })
                .collect(),
        }
    }

    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let query = Self::sql_query("where events.id = any($1)");
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, Self::from_row).await.context("failed to load events from DB")
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        // TODO This is the same query as above with an additional `where`-clause.
        // It should probably be factored out somehow but with the formatting going on
        // that can't really be done at compile time. :(
        let query = Self::sql_query("");
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, Self::from_row).await.context("failed to load events from DB")
    }
}

pub(super) async fn rebuild(meili: &Client, db: &Transaction<'_>) -> Result<Task> {
    let events = Event::load_all(&**db).await?;
    debug!("Loaded {} events from DB", events.len());

    let task = meili.event_index.add_documents(&events, None).await?;
    debug!("Sent {} events to Meili for indexing", events.len());

    Ok(task)
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(
        index,
        "event",
        &["title", "creators", "description", "series_title"],
        &["listed", "read_roles", "write_roles"],
    ).await
}
