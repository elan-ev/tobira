use std::{sync::LazyLock, time::Duration};

use ahash::AHashSet;
use meilisearch_sdk::{errors::{Error, ErrorCode}, indexes::Index, tasks::Task, task_info::TaskInfo};

use crate::{
    auth::ROLE_ADMIN,
    prelude::*,
};

use super::Client;


pub(super) struct FieldAbilities<'a> {
    pub(super) searchable: &'a [&'a str],
    pub(super) filterable: &'a [&'a str],
    pub(super) sortable: &'a [&'a str],
}

// Helper function to only set special attributes when they are not correctly
// set yet. Unfortunately Meili seems to perform lots of work when setting
// them, even if the special attribute set was the same before.
pub(super) async fn lazy_set_special_attributes(
    index: &Index,
    index_name: &str,
    fields: FieldAbilities<'_>,
) -> Result<()> {
    /// Set comparison between attributes
    fn set_equal(actual: Vec<String>, expected: &[&str]) -> bool {
        use std::collections::HashSet;

        let actual = actual.iter().map(|s| s.as_str()).collect::<HashSet<_>>();
        let expected = expected.iter().map(|s| *s).collect::<HashSet<_>>();

        actual == expected
    }

    if index.get_searchable_attributes().await? != fields.searchable {
        debug!("Updating `searchable_attributes` of {index_name} index");
        index.set_searchable_attributes(fields.searchable).await?;
    }

    if !set_equal(index.get_filterable_attributes().await?, fields.filterable) {
        debug!("Updating `filterable_attributes` of {index_name} index");
        index.set_filterable_attributes(fields.filterable).await?;
    }

    if !set_equal(index.get_sortable_attributes().await?, fields.sortable) {
        debug!("Updating `sortable_attributes` of {index_name} index");
        index.set_sortable_attributes(fields.sortable).await?;
    }

    Ok(())
}

// This might seem like a good use case for a perfect hash table, but that's not
// even faster than this solution with a really fast hash. See
// https://github.com/LukasKalbertodt/case-insensitive-small-set-bench
pub static STOP_WORDS: LazyLock<AHashSet<&str>> = LazyLock::new(|| {
    const RAW: &str = include_str!("stop-words.txt");
    RAW.lines()
        .map(|l| l.split('#').next().unwrap().trim())
        .filter(|s| !s.is_empty())
        .collect()
});

/// Returns `true` iff the given string is contained in our list of stop words.
/// The comparison ignores ASCII case.
///
/// We do have a few stop words with non-ASCII chars, but those are only in the
/// middle of the word. And ASCII-lowercasing is much easier and therefore
/// faster than proper Unicode-lowercasing.
pub fn is_stop_word(s: &str) -> bool {
    if s.bytes().all(|b| b.is_ascii_lowercase()) {
        STOP_WORDS.contains(s)
    } else {
        // This string allocation seems like it would really hurt
        // performance, but it's really not that bad. All in all, doing
        // it like this is actually quite fast. See
        // https://github.com/LukasKalbertodt/case-insensitive-small-set-bench
        STOP_WORDS.contains(s.to_ascii_lowercase().as_str())
    }
}

/// Encodes roles inside an ACL (e.g. for an event) to be stored in the index.
/// The roles are hex encoded to be filterable properly with Meili's
/// case-insensitive filtering. Also, `ROLE_ADMIN` is removed as an space
/// optimization. We handle this case specifically by skipping the ACL check if
/// the user has ROLE_ADMIN.
pub(super) fn encode_acl(roles: &[String]) -> Vec<String> {
    roles.iter()
        .filter(|&role| role != ROLE_ADMIN)
        .map(hex::encode)
        .collect()
}

/// Decodes hex encoded ACL roles.
pub(crate) fn decode_acl(roles: &[String]) -> Vec<String> {
    roles.iter()
        .map(|role| {
            let bytes = hex::decode(role).expect("Failed to decode role");

            String::from_utf8(bytes).expect("Failed to convert bytes to string")
        })
        .collect()
}

/// Returns `true` if the given error has the error code `IndexNotFound`
pub(super) fn is_index_not_found(err: &Error) -> bool {
    matches!(err, Error::Meilisearch(e) if e.error_code == ErrorCode::IndexNotFound)
}

pub(super) async fn wait_on_task(task: TaskInfo, meili: &Client) -> Result<()> {
    let task = task.wait_for_completion(
        &meili.client,
        Some(Duration::from_millis(200)),
        Some(Duration::MAX),
    ).await?;

    if let Task::Failed { content } = task {
        error!("Task failed: {:#?}", content);
        bail!(
            "Indexing task for index '{:?}' failed: {}",
            content.task.index_uid,
            content.error.error_message,
        );
    }

    Ok(())
}
