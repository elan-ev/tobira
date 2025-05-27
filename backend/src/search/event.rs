use std::{cmp::{max, min}, collections::{BTreeMap, BinaryHeap, HashMap}, fmt::Write};

use chrono::{DateTime, Utc};
use fallible_iterator::FallibleIterator;
use meilisearch_sdk::{indexes::Index, search::MatchRange};
use postgres_types::FromSql;
use serde::{Serialize, Deserialize};
use tokio_postgres::GenericClient;

use crate::{
    api::model::search::{ByteSpan, TextMatch},
    db::{
        types::{TextAssetType, TimespanText},
        util::{collect_rows_mapped, impl_from_db}
    },
    model::Key,
    prelude::*,
    util::{base64_decode, BASE64_DIGITS},
};

use super::{
    realm::Realm,
    util::{self, is_stop_word, FieldAbilities},
    IndexItem, IndexItemKind, SearchId,
};



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
    pub(crate) has_password: bool,

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
    pub(crate) preview_roles: Vec<String>,
    pub(crate) read_roles: Vec<String>,
    pub(crate) write_roles: Vec<String>,

    // The `listed` field is always derived from `host_realms`, but we need to
    // store it explicitly to filter for this condition in Meili.
    pub(crate) listed: bool,
    pub(crate) host_realms: Vec<Realm>,

    pub(crate) caption_texts: TextSearchIndex,
    pub(crate) slide_texts: TextSearchIndex,
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
            read_roles, write_roles, preview_roles, has_password,
            host_realms, slide_texts, caption_texts,
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
            preview_roles: util::encode_acl(&row.preview_roles::<Vec<String>>()),
            read_roles: util::encode_acl(&row.read_roles::<Vec<String>>()),
            write_roles: util::encode_acl(&row.write_roles::<Vec<String>>()),
            listed: host_realms.iter().any(|realm| !realm.is_user_realm()),
            host_realms,
            slide_texts: row.slide_texts::<Option<TextSearchIndex>>()
                .unwrap_or_else(TextSearchIndex::empty),
            caption_texts: row.caption_texts::<Option<TextSearchIndex>>()
                .unwrap_or_else(TextSearchIndex::empty),
            has_password: row.has_password(),
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
        searchable: &[
            "title",
            "creators",
            "description",
            "series_title",
            "slide_texts.texts",
            "caption_texts.texts",
        ],
        filterable: &[
            "id",
            "listed",
            "preview_roles",
            "read_roles",
            "write_roles",
            "is_live",
            "end_time_timestamp",
            "created_timestamp",
            "series_id",
        ],
        sortable: &["updated_timestamp"],
    }).await
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct SearchTimespan {
    start: u64,
    duration: u64,
}

impl SearchTimespan {
    /// We reduce the precision of our timestamps to 100ms, as more is really
    /// not needed for search.
    const PRECISION: u64 = 100;

    fn from_tst(v: &TimespanText) -> Self {
        Self {
            start: v.span_start as u64 / Self::PRECISION,
            duration: (v.span_end as u64).saturating_sub(v.span_start as u64) / Self::PRECISION,
        }
    }

    fn api_start(&self) -> f64 {
        (self.start * Self::PRECISION) as f64
    }

    fn api_duration(&self) -> f64 {
        (self.duration * Self::PRECISION) as f64
    }
}

/// What we store in Meili to nicely search through texts and then lookup the
/// corresponding timespan for the match. This is built inside `FromSql` as
/// that way, we can avoid useless heap allocations.
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
    timespan_index: String,
}

impl TextSearchIndex {
    fn empty() -> Self {
        Self {
            texts: String::new(),
            timespan_index: String::new(),
        }
    }

    /// Looks up a match position (byte offset inside `texts`) and returns the
    /// index of the entry in this index. Panics if `texts` is empty, i.e. if
    /// there is no way there is a match inside that field.
    fn lookup(&self, match_range: &MatchRange) -> usize {
        let lens = self.index_lengths();
        let index = self.index_entries();
        let entry_len = lens.entry_len;

        assert!(match_range.start < self.texts.len());
        assert!(index.len() % entry_len == 0, "broken index: incorrect length");

        let decode_byte_offset = |slot: usize| -> u64 {
            Self::decode_index_int(&index[slot * entry_len..][..lens.offset_digits as usize])
        };


        // Perform binary search over the index. We treat `entry_len` bytes in
        // the index as one item here.
        (|| {
            let needle = match_range.start as u64;

            let num_entries = index.len() / entry_len;
            let mut size = num_entries;
            let mut left = 0;
            let mut right = size;
            while left < right {
                let mid = left + size / 2;
                let v = decode_byte_offset(mid);

                // This binary search isn't for an exact value but for a range.
                // We want to find the entry with a "offset" value of <= needle,
                // and where the next entry has an "offset" value > needle.
                if needle < v {
                    // Needle is smaller than the offset value -> we have to
                    // look in the left half.
                    right = mid;
                } else if needle == v || mid + 1 == num_entries {
                    // Either the needle matches the offset value
                    // (obvious success) or it is larger and we are looking at
                    // the last entry. In that case, we also return the last
                    // entry.
                    return mid;
                } else {
                    // In this case, the needle is larger than the offset value,
                    // so we check if it is smaller than the next entry's
                    // offset value. If so, we found the correct entry,
                    // otherwise recurse on right half.
                    let next_v = decode_byte_offset(mid + 1);
                    if needle < next_v {
                        return mid;
                    }
                    left = mid + 1;
                }

                size = right - left;
            }

            // By construction, the first entry in the index always has the
            // offset 0, and we just return the last entry if the needle is
            // larger than the largest offset value.
            unreachable!()
        })()
    }

    /// Returns the timespan of the given slot.
    fn timespan_of_slot(&self, slot: usize) -> SearchTimespan {
        let lens = self.index_lengths();
        let start_idx = slot * lens.entry_len as usize + lens.offset_digits as usize;
        let duration_idx = start_idx + lens.start_digits as usize;

        let start_bytes = &self.index_entries()[start_idx..][..lens.start_digits as usize];
        let duration_bytes = &self.index_entries()[duration_idx..][..lens.duration_digits as usize];

        SearchTimespan {
            start: Self::decode_index_int(start_bytes),
            duration: Self::decode_index_int(duration_bytes),
        }
    }

    /// Reads the index header and returns the lengths of all fields.
    fn index_lengths(&self) -> IndexLengths {
        let index = &self.timespan_index.as_bytes();

        let offset_digits = index[0] - b'0' + 1;
        let start_digits = index[1] - b'0' + 1;
        let duration_digits = index[2] - b'0' + 1;
        IndexLengths {
            offset_digits,
            start_digits,
            duration_digits,
            entry_len: (offset_digits + start_digits + duration_digits) as usize,
        }
    }

    /// Returns the main part of the index, the array of entries. Strips the
    /// header specifying the lengths.
    fn index_entries(&self) -> &[u8] {
        &self.timespan_index.as_bytes()[3..]
    }

    /// Decodes a base64 encoded integer.
    fn decode_index_int(src: &[u8]) -> u64 {
        // Least significant digits comes first, so we iterate in reverse
        // and multiply by 64 each time.
        let mut out = 0;
        for byte in src.iter().rev() {
            let digit = base64_decode(*byte).expect("invalid base64 digit in index");
            out = out * 64 + digit as u64;
        }
        out
    }

    pub(crate) fn resolve_matches(
        &self,
        matches: &[MatchRange],
        out: &mut Vec<TextMatch>,
        ty: TextAssetType,
    ) {
        if matches.is_empty() || self.texts.is_empty() {
            return;
        }

        // Resolve all matches and then bucket them by the individual text they
        // belong to.
        let mut entries = HashMap::new();
        for match_range in matches {
            // We ignore super short matches. For example, including `a`
            // anywhere in the query would result in tons of matches
            // otherwise.
            if match_range.length <= 1 {
                continue;
            }

            // Get correct indices and the actual text snippet. Unfortunately,
            // Meilisearch might sometimes return invalid indices that slice
            // UTF-8 codepoints in half, so we need to protect against that.
            let start = ceil_char_boundary(&self.texts, match_range.start);
            let end = ceil_char_boundary(&self.texts, match_range.start + match_range.length);
            let snippet = &self.texts[start..end];

            // If the match is a single stop word, we ignore it.
            if is_stop_word(snippet) {
                continue;
            }

            let slot = self.lookup(match_range);
            let matches = entries.entry(slot as u32).or_insert_with(Vec::new);

            // We only consider a limited number of matches inside the same text
            // to avoid getting way too large API responses. The frontend cuts
            // off the text anyway at some point.
            if matches.len() < 10 {
                matches.push(match_range);
            }
        }

        // We reduce the number of matches if necessary.
        const LIMIT: usize = 20;
        let simplified = simplify_matches(
            LIMIT,
            entries.keys().map(|&slot| (slot, self.timespan_of_slot(slot as usize)))
        );

        for (slot, timespan) in simplified {
            let matches = entries.get(&slot).unwrap();

            // Get the range that includes all matches
            let full_range = {
                let mut it = matches.iter();
                let first = it.next().unwrap();
                let init = first.start..first.start + first.length;
                let combined = it.fold(init, |acc, m| {
                    min(acc.start, m.start)..max(acc.end, m.start + m.length)
                });

                // Unfortunately, Meili can sometimes return invalid ranges,
                // slicing into UTF-8 chars, so we also ceil here.
                let start = ceil_char_boundary(&self.texts, combined.start);
                let end = ceil_char_boundary(&self.texts, combined.end);
                start..end
            };

            // Add a bit of margin to include more context in the text. We only
            // include context from the same text though, meaning we only go to
            // the next `;` or `\n`.
            let range_with_context = {
                let max_distance = 80;
                let separators = &[';', '\n'];

                // First just add a fixed margin around the match, as a limit.
                let margin_start = full_range.start.saturating_sub(max_distance);
                let margin_end = std::cmp::min(
                    full_range.end + max_distance,
                    self.texts.len(),
                );

                let margin_start = ceil_char_boundary(&self.texts, margin_start);
                let margin_end = ceil_char_boundary(&self.texts, margin_end);

                // Search forwards and backwards from the match point to find
                // boundaries of the text.
                let start = self.texts[margin_start..full_range.start]
                    .rfind(separators)
                    .map(|p| margin_start + p + 1)
                    .unwrap_or(margin_start);
                let end = self.texts[full_range.end..margin_end]
                    .find(separators)
                    .map(|p| full_range.end + p)
                    .unwrap_or(margin_end);
                start..end
            };

            let highlights = matches.iter().map(|m| {
                ByteSpan {
                    start: (m.start - range_with_context.start) as u32,
                    len: m.length as u32,
                }
            }).collect();


            out.push(TextMatch {
                start: timespan.api_start(),
                duration: timespan.api_duration(),
                text: self.texts[range_with_context].to_owned(),
                ty,
                highlights,
            });
        }
    }
}


/// Reduces the number of `matches` to `target_count` by successively merging
/// two matches. Merging results in a timespan covering both matches, and an
/// arbitrary slot from one of the inputs.
///
/// The metric which two matches to merge next is the crux of this function.
/// Currently, it's simply "size of resulting interval", i.e. the two matches
/// are merged which will result in the smallest interval. This metric is
/// probably not ideal and we would rather also consider how much intervals
/// overlap or how far they are apart. But the algorithm currently depends on
/// some properties offered by the "size" metric, specifically:
/// - When searching for the best rightward partner, we can stop searching once
///   the next candidate has `start > best.end`.
/// - The merge of a+b is never a better rightward partner for any interval than
///   `a` or `b` would have been.
///
/// Both of these properties are not strictly necessary for the algorithm to
/// work, but when implementing this, there were more important things to do,
/// so the simpler metric was kept.
///
/// This function runs in O(n log n). The basic idea is to have list of
/// interval, sorted by start time, plus a heap to extract the best merge. The
/// main loop just loops as long as we still have too many intervals, extracts
/// the best merge and performs the merge. There are of course O(n²) many
/// possible merges, but for each interval, there is a clear best partner
/// (called BRP, best rightward partner), so our heap only needs to hold O(n)
/// items, as long as we update everything correctly.
///
/// When merging, we would need to remove two intervals and add a new one. Doing
/// that naively in `intervals`, while keeping its order, would be O(n). What
/// we do instead is to replace the input interval with the lower `start` with
/// the merged one (this maintains the order), and to soft-delete the other
/// input interval. Soft-delete just means using a sentinal value in the list
/// to denote a deleted element. This slows down the BRP search, unfortunately,
/// and it's possible that some fringe cases will cause a quadratic runtime,
/// but that is very unlikely to happen with real world data.
///
/// The BRP search is not ideal anyway: we limit the search artificially to
/// prevent quadratic blowup. When there are no overlapping intervals, that's
/// not a problem at all. But one might imagine optimizing the BRP search with
/// stricter runtime guarantees in the future. But it's not important for our
/// use case.
fn simplify_matches(
    target_count: usize,
    matches: impl Iterator<Item = (u32, SearchTimespan)> + ExactSizeIterator,
) -> impl Iterator<Item = (u32, SearchTimespan)> {
    #[derive(Clone, Copy)]
    struct Interval {
        start: u64,
        end: u64,
        slot: u32,
    }

    impl Interval {
        fn invalid() -> Self {
            Self {
                start: u64::MAX,
                end: 0,
                slot: 0,
            }
        }

        fn is_invalid(&self) -> bool {
            self.start > self.end
        }

        fn size(&self) -> u64 {
            self.end - self.start
        }
    }

    fn merge(a: Interval, b: Interval) -> Interval {
        Interval {
            start: min(a.start, b.start),
            end: max(a.end, b.end),
            slot: a.slot, // Just arbitrarily pick one
        }
    }


    /// Condition: `intervals[base_idx].start <= intervals[brp_idx].start`.
    #[derive(Copy, Clone, PartialEq, Eq)]
    struct HeapEntry {
        merged_size: u64,
        /// The interval with the smaller `start`. For each interval (except the
        /// last one), there will be exactly one heap entry with the `base_idx`
        /// pointing to that interval.
        base_idx: usize,
        /// The BRP of the base.
        brp_idx: usize,
    }

    impl PartialOrd for HeapEntry {
        fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
            Some(self.cmp(other))
        }
    }

    impl Ord for HeapEntry {
        fn cmp(&self, other: &Self) -> std::cmp::Ordering {
            self.merged_size.cmp(&other.merged_size)
                .reverse()
                // We include the indices only to match the `Eq` impl. The order of
                // two entries with same `size` does not matter to the algorithm.
                .then_with(|| (self.base_idx, self.brp_idx).cmp(&(other.base_idx, other.brp_idx)))
        }
    }


    /// Returns the "best rightward partner" (BRP) for the interval at `idx`.
    ///
    /// This is the interval P with the minimum `end` value among all intervals that
    /// have a `start` >= the `start` of the given interval. The latter condition
    /// is equal to "all elements right of `idx`", since the slice is sorted by
    /// `start`. Hence the name "rightward".
    fn best_rightward_partner(intervals: &[Interval], idx: usize) -> Option<usize> {
        const LIMIT: u32 = 8;

        let mut min_end = u64::MAX;
        let mut best_candidate = None;
        let mut checked = 0;
        for (rel_candidate_idx, candidate) in intervals[idx + 1..].iter().enumerate() {
            let candidate_idx = rel_candidate_idx + idx + 1;
            if candidate.is_invalid() {
                // Just skip invalid ones and don't consider them in the limit.
                continue;
            } else if candidate.start >= min_end {
                // At this point, there cannot be any more better candidates.
                break;
            }

            if candidate.end < min_end {
                min_end = candidate.end;
                best_candidate = Some(candidate_idx);
            }

            // Stop after some attempts. This is just here to avoid quadratic blowup
            // of the algorithm. This will rarely be needed. For example, if there
            // is no overlap between intervals (which is true for most events), the
            // above `break` will be reached in the 2nd loop iteration every time.
            // This limit will only be reached if there is a lot of overlap. And if
            // the limit triggers, we just end up with a potential suboptimal
            // merge. This just slightly decreases the output quality but does not
            // break the algorithm or lead to any bad problems, as far as I can tell.
            checked += 1;
            if checked > LIMIT {
                break;
            }
        }
        best_candidate
    }

    fn push_entry_for_base(
        base_idx: usize,
        intervals: &[Interval],
        heap: &mut BinaryHeap<HeapEntry>,
    ) {
        if let Some(partner_idx) = best_rightward_partner(&intervals, base_idx) {
            let merged = merge(intervals[base_idx], intervals[partner_idx]);
            heap.push(HeapEntry {
                merged_size: merged.size(),
                base_idx,
                brp_idx: partner_idx,
            });
        }
    }


    // Early exit if there is nothing to do.
    if matches.len() <= target_count {
        return either::Left(matches);
    }

    // Convert to internal representation and sort by start point.
    let mut intervals = matches.map(|(slot, ts)| Interval {
        start: ts.start,
        end: ts.start + ts.duration,
        slot,
    }).collect::<Vec<_>>();
    intervals.sort_by_key(|i| i.start);

    // Built initial heap
    let mut heap = BinaryHeap::with_capacity(intervals.len());
    for (idx, _) in intervals.iter().enumerate() {
        push_entry_for_base(idx, &intervals, &mut heap);
    }

    // Main loop
    let mut soft_deleted = 0;
    while intervals.len() - soft_deleted > target_count {
        // Heap has at least as many entries as `intervals`, so we can unwrap.
        let entry = heap.pop().unwrap();
        let HeapEntry { base_idx, brp_idx, .. } = entry;
        let base = intervals[base_idx];
        let brp = intervals[brp_idx];


        // If the base is invalid, we caught case (2) below: delayed deletion.
        // We just ignore this entry as it's no longer valid.
        if base.is_invalid() {
            continue;
        }


        let merged = merge(base, brp);

        // Catch case (3) and (4).
        //
        // Case 4 (entries that used a now soft-deleted interval as BRP) is
        // caught by `brp.is_invalid()`. Case 3 (entries that use an interval
        // replaced by a merge) as BRP is caught by the size mismatch. Well,
        // kind of. If the size is correct, the interval might still have been
        // replaced by a merge, but the merge didn't change its `end`, so the
        // heap entry was still valid and we can continue as normal.
        if brp.is_invalid() || entry.merged_size != merged.size() {
            // But in this case, we need to find the new BRP for `base` and push
            // a new entry for it. Again, this new entry will have a size of >=
            // the entry we just popped.
            push_entry_for_base(base_idx, &intervals, &mut heap);
            continue;
        }


        // Replace `base` with `merged`. This maintains the ordering by `start`.
        // Also soft-delete `brp`.
        intervals[base_idx] = merged;
        let merged_idx = base_idx;
        intervals[brp_idx] = Interval::invalid();
        soft_deleted += 1;


        // Update heap.
        //
        // Some entries in the heap might reference `a` or `b`. Those are not
        // valid anymore and need to be replaced. Replacing or removing things
        // in the binary heap from `std` is impossible, it would require a
        // secondary data structure. There are crates offering this, but we
        // don't need it. Instead, we can use "delayed invalidation", meaning
        // that we detect invalid entries after popping them from the heap and
        // then just ignoring or replace them.
        //
        // Of course, this means that the heap is larger, as it contains dummy
        // values. But the heap is still O(n) at all times: it starts with n-1
        // elements and each loop iteration, one element is popped and either 0
        // or 1 element is pushed, so it never grows in size.
        //
        // We care about heap entries `e` with:
        // - (1) ... `e.base = base`: there was only one and it was just popped.
        // - (2) ... `e.base = brp`: there exists one in the heap that should be
        //   deleted, but since we cannot easily delete it now, we do delayed
        //   deletion.
        // - (3) ... `e.brp = base`
        // - (4) ... `e.brp = brp`
        //
        // For cases (3) and (4), we need to find their base's new BRP. Instead
        // of doing that now, we just do it when the entry is popped. The
        // important property here is that the new BRP never results in a merge
        // smaller than the previous BRP. That means the invalid entry will be
        // popped from the heap not after the corrected one would.
        //
        // Finally, there is missing an entry with the new merged interval as
        // `base`, which we push now.
        push_entry_for_base(merged_idx, &intervals, &mut heap);
    }

    either::Right(
        intervals.into_iter()
            .filter(|i| !i.is_invalid())
            .map(|i| (i.slot, SearchTimespan {
                start: i.start,
                duration: i.end - i.start,
            }))
    )
}

fn ceil_char_boundary(s: &str, idx: usize) -> usize {
    if idx > s.len() {
        s.len()
    } else {
        (0..3).map(|offset| idx + offset)
            .find(|idx| s.is_char_boundary(*idx))
            .unwrap()
    }
}

struct IndexLengths {
    offset_digits: u8,
    start_digits: u8,
    duration_digits: u8,
    entry_len: usize,
}

impl<'a> FromSql<'a> for TextSearchIndex {
    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        // ----- Step 0: Postgres stuff -----------------------------------------------------------
        let member_type = match *ty.kind() {
            postgres_types::Kind::Array(ref member) => member,
            _ => panic!("expected array type"),
        };

        let array = postgres_protocol::types::array_from_sql(raw)?;
        if array.dimensions().count()? > 1 {
            return Err("array contains too many dimensions".into());
        }


        // ----- Step 1: Read all data, transform and analyze it ----------------------------------
        //
        // Clean texts by filtering out ones that are very unlikely to
        // contribute to a meaningful search experience. The responsibility of
        // delivering good texts to search for is still with Opencast and its
        // captions and slide texts. It doesn't hurt to do some basic cleaning
        // here though.
        //
        // We also gather some statistical data and concat all strings that have
        // the same timespan into a single string (separated by newline).
        let mut needed_main_capacity = 0;
        let mut max_duration = 0;
        let mut max_start = 0;
        let mut texts = <BTreeMap<_, String>>::new();
        let mut it = array.values();
        while let Some(v) = it.next()? {
            let ts = TimespanText::from_sql_nullable(member_type, v)?;

            // We exclude all strings that contain no segments longer than 1
            // byte. However, we do not remove these short segments from
            // strings that do have longer words, as included strings should be
            // kept intact, otherwise we will transform "Saw a dog" into "Saw
            // dog", which is something we show the user.
            //
            // Counting 'bytes' instead of chars is deliberate, as we can only
            // be sure about ASCII characters that they don't contain intrinsic
            // meaning worth searching for individually.
            let s = ts.t.trim();
            if s.split_whitespace().all(|part| part.len() <= 1) {
                continue;
            }

            let key = SearchTimespan::from_tst(&ts);

            // Skip empty timespans (after reducing to our lower precision).
            if key.duration == 0 {
                continue;
            }

            let buf = texts.entry(key).or_default();

            // If the text is already present in this span, we do not include it
            // again. This can happen if some text is repeated in a slide for
            // example. Having duplicates is not useful for search. The `4096`
            // limit is just there to avoid quadratic blowup in case there are
            // lots of texts in the same span.
            if buf[..min(buf.len(), 4096)].contains(s) {
                continue;
            }

            if !buf.is_empty() {
                needed_main_capacity += 1;
                buf.push('\n');
            }
            needed_main_capacity += s.len();
            buf.push_str(s);

            max_start = max(max_start, key.start);
            max_duration = max(max_duration, key.duration);
        }


        // ----- Step 2: actually build the two fields that we store in Meili ---------------------

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
            timespan_index: String::with_capacity(index_len),
        };

        // Write index header, specifying how each field is encoded. We subtract
        // by 1 to make sure we always use exactly one digit.
        write!(
            out.timespan_index,
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
                out.timespan_index.push(digit);
                value /= 64;
            }
            debug_assert!(value == 0);
        };

        for (ts, s) in texts {
            if !out.texts.is_empty() {
                out.texts.push(';');
            }
            let offset = out.texts.len() as u64;
            out.texts.push_str(&s);
            encode_index_int(offset, offset_digits);
            encode_index_int(ts.start, start_digits);
            encode_index_int(ts.duration, duration_digits);
        }

        Ok(out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool {
        match *ty.kind() {
            postgres_types::Kind::Array(ref inner) => TimespanText::accepts(inner),
            _ => false,
        }
    }
}
