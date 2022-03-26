use std::time::Duration;

use meilisearch_sdk::{errors::{Error, ErrorCode}, indexes::Index, tasks::Task};

use crate::{
    auth::ROLE_ADMIN,
    prelude::*,
};

use super::Client;


// Helper function to only set special attributes when they are not correctly
// set yet. Unfortunately Meili seems to perform lots of work when setting
// them, even if the special attribute set was the same before.
pub(super) async fn lazy_set_special_attributes(
    index: &Index,
    index_name: &str,
    searchable_attrs: &[&str],
    filterable_attrs: &[&str],
) -> Result<()> {
    if index.get_searchable_attributes().await? != searchable_attrs {
        debug!("Updating `searchable_attributes` of {index_name} index");
        index.set_searchable_attributes(searchable_attrs).await?;
    }

    if index.get_filterable_attributes().await? != filterable_attrs {
        debug!("Updating `filterable_attributes` of {index_name} index");
        index.set_filterable_attributes(filterable_attrs).await?;
    }

    Ok(())
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

/// Returns `true` if the given error has the error code `IndexNotFound`
pub(super) fn is_index_not_found(err: &Error) -> bool {
    matches!(err, Error::Meilisearch(e) if e.error_code == ErrorCode::IndexNotFound)
}

pub(super) async fn wait_on_task(task: Task, meili: &Client) -> Result<()> {
    let task = task.wait_for_completion(
        &meili.client,
        Some(Duration::from_millis(200)),
        Some(Duration::MAX),
    ).await?;

    if let Task::Failed { content } = task {
        error!("Task failed: {:#?}", content);
        bail!(
            "Indexing task for index '{}' failed: {}",
            content.task.index_uid,
            content.error.error_message,
        );
    }

    Ok(())
}
