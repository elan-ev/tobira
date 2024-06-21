use std::cmp::max;

use chrono::{DateTime, Utc};
use meilisearch_sdk::indexes::Index;
use serde::{Serialize, Deserialize};
use tokio_postgres::GenericClient;

use crate::{
    db::{types::{Key, TimespanText}, util::{collect_rows_mapped, impl_from_db}}, prelude::*, util::BASE64_DIGITS
};

use super::{realm::Realm, util::{self, FieldAbilities}, IndexItem, IndexItemKind, SearchId};



#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Event {
    pub(crate) id: SearchId,
    pub(crate) series_id: Option<SearchId>,
    pub(crate) series_title: Option<String>,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) creators: Vec<String>,
    pub(crate) thumbnail: Option<String>,
    pub(crate) duration: i64,
    pub(crate) updated: DateTime<Utc>,
    pub(crate) updated_timestamp: i64,
    pub(crate) created: DateTime<Utc>,
    pub(crate) created_timestamp: i64,
    pub(crate) start_time: Option<DateTime<Utc>>,
    pub(crate) end_time: Option<DateTime<Utc>>,
    pub(crate) end_time_timestamp: Option<i64>,
    pub(crate) is_live: bool,
    pub(crate) audio_only: bool,

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

    // The `listed` field is always derived from `host_realms`, but we need to
    // store it explicitly to filter for this condition in Meili.
    pub(crate) listed: bool,
    pub(crate) host_realms: Vec<Realm>,

    #[serde(flatten)]
    pub(crate) text_index: TextSearchIndex,
}

impl IndexItem for Event {
    const KIND: IndexItemKind = IndexItemKind::Event;
    fn id(&self) -> SearchId {
        self.id
    }
}

impl_from_db!(
    Event,
    select: {
        search_events.{
            id, series, series_title, title, description, creators, thumbnail,
            duration, is_live, updated, created, start_time, end_time, audio_only,
            read_roles, write_roles, host_realms, texts,
        },
    },
    |row| {
        let host_realms = row.host_realms::<Vec<Realm>>();
        let end_time = row.end_time();
        let updated = row.updated();
        let created = row.created();
        Self {
            id: row.id(),
            series_id: row.series(),
            series_title: row.series_title(),
            title: row.title(),
            description: row.description(),
            creators: row.creators(),
            thumbnail: row.thumbnail(),
            duration: row.duration(),
            is_live: row.is_live(),
            audio_only: row.audio_only(),
            updated,
            updated_timestamp: updated.timestamp(),
            created,
            created_timestamp: created.timestamp(),
            start_time: row.start_time(),
            end_time,
            end_time_timestamp: end_time.map(|date_time| date_time.timestamp()),
            read_roles: util::encode_acl(&row.read_roles::<Vec<String>>()),
            write_roles: util::encode_acl(&row.write_roles::<Vec<String>>()),
            listed: host_realms.iter().any(|realm| !realm.is_user_realm()),
            host_realms,
            text_index: TextSearchIndex::build(row.texts()),
        }
    }
);

impl Event {
    pub(crate) async fn load_by_ids(db: &impl GenericClient, ids: &[Key]) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_events \
            where id = any($1) and state <> 'waiting'");
        let rows = db.query_raw(&query, dbargs![&ids]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load events from DB")
    }

    pub(crate) async fn load_all(db: &impl GenericClient) -> Result<Vec<Self>> {
        let selection = Self::select();
        let query = format!("select {selection} from search_events where state <> 'waiting'");
        let rows = db.query_raw(&query, dbargs![]);
        collect_rows_mapped(rows, |row| Self::from_row_start(&row))
            .await
            .context("failed to load events from DB")
    }
}

pub(super) async fn prepare_index(index: &Index) -> Result<()> {
    util::lazy_set_special_attributes(index, "event", FieldAbilities {
        searchable: &["title", "creators", "description", "series_title", "texts"],
        filterable: &["listed", "read_roles", "write_roles", "is_live", "end_time_timestamp", "created_timestamp"],
        sortable: &["updated_timestamp"],
    }).await
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct TextSearchIndex {
    /// This contains all source strings concatenated with `;` as separator. You
    /// might wonder that `;` is a bad choice as it can also appear in the
    /// source strings. However, `;` is treated as a hard separator by Meili.
    /// Even with phrase search (""), the input query is split at `;`, so the
    /// query `"foo;bar"` will always find documents containing "foo"
    /// and "bar". It makes no difference whether this field contains `foo;bar`
    /// or `foo𑱱bar` (random other separator), the search finds both. From all
    /// the hard separators, we use `;` as it is only one byte long.
    texts: String,

    /// This field is for translating the byte offset we get from Meili
    /// (for matches found in `texts`) to the time span inside the video. I
    /// tried to keep this index as small as possible while still allowing fast
    /// lookups.
    ///
    /// This string starts with three hex digits specifying how many bytes are
    /// used to encode the three different integers fields. Add one to these
    /// digits to get the actual number of bytes. For example `121` means that:
    /// - The byte offset field is stored with 2 base64 digits.
    /// - The start timestamp field is stored with 3 base64 digits.
    /// - The duration field is stored with 2 base64 digits.
    ///
    /// After this three byte header follows an array where each item contains
    /// these three fields (in that order), i.e. each item is 7 bytes in total
    /// in the example above. Each field is base64 encoded. This array allows
    /// random access, useful for binary search.
    text_timespan_index: String,
}

impl TextSearchIndex {
    fn build(db_texts: Option<Vec<TimespanText>>) -> Self {
        // We reduce the precision of our timestamps to 100ms, as more is really
        // not needed for search.
        const PRECISION: u64 = 100;

        fn duration(ts: &TimespanText) -> u64 {
            (ts.span_end as u64).saturating_sub(ts.span_start as u64) / PRECISION
        }

        let mut texts = db_texts.unwrap_or_default();

        // ----- Step 1:
        //
        // Clean texts by filtering out ones that are very unlikely to
        // contribute to a meaningful search experience. The responsibility of
        // delivering good texts to search for is still with Opencast and its
        // captions and slide texts. It doesn't hurt to do some basic cleaning
        // here though.
        //
        // In this step we also gather various stats about the data which we
        // will use later.
        let mut needed_main_capacity = 0;
        let mut max_duration = 0;
        let mut max_start = 0;
        texts.retain(|ts| {
            // TODO: Do more cleanup.
            let s = ts.t.trim();
            if s.len() <= 1 {
                return false;
            }

            max_duration = max(max_duration, duration(ts));
            max_start = max(max_start, ts.span_start as u64 / PRECISION);
            needed_main_capacity += ts.t.len();
            true
        });

        if texts.is_empty() {
            return Self { texts: String::new(), text_timespan_index: String::new() };
        }


        // ----- Step 2: actually build the two fields that we store in Meili.

        // For the separators.
        needed_main_capacity += texts.len().saturating_sub(1);

        // Figure out how much base64 digits we need for the three fields.
        let required_digits = |max: u64| if max == 0 { 1 } else { max.ilog(64) + 1 };
        let offset_digits = required_digits(needed_main_capacity as u64);
        let start_digits = required_digits(max_start);
        let duration_digits = required_digits(max_duration);

        // Original duration uses u64, but is divided by 100. And 2^64 / 100 is
        // less than 64^10.
        assert!(offset_digits <= 10 && start_digits <= 10 && duration_digits <= 10);

        let index_len = 3 + (offset_digits + start_digits + duration_digits) as usize * texts.len();
        let mut out = Self {
            texts: String::with_capacity(needed_main_capacity),
            text_timespan_index: String::with_capacity(index_len),
        };

        // Write index header, specifying how each field is encoded. We subtract
        // by 1 to make sure we always use exactly one digit.
        use std::fmt::Write;
        write!(
            out.text_timespan_index,
            "{}{}{}",
            offset_digits - 1,
            start_digits - 1,
            duration_digits - 1,
        ).unwrap();

        let mut encode_index_int = |mut value: u64, digits: u32| {
            // This is reverse order encoding for convience/performance here.
            // Least significant digit is leftmost.
            for _ in 0..digits {
                let digit = BASE64_DIGITS[value as usize % 64].into();
                out.text_timespan_index.push(digit);
                value /= 64;
            }
            debug_assert!(value == 0);
        };

        for ts in texts {
            if !out.texts.is_empty() {
                out.texts.push(';');
            }
            let offset = out.texts.len() as u64;
            out.texts.push_str(&ts.t);
            encode_index_int(offset, offset_digits);
            encode_index_int(ts.span_start as u64 / PRECISION, start_digits);
            encode_index_int(duration(&ts), duration_digits);
        }

        out
    }
}
