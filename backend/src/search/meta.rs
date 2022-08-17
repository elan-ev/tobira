use meilisearch_sdk::indexes::Index;
use serde::{Serialize, Deserialize};

use crate::prelude::*;

use super::VERSION;


/// Data stored in the 'meta' index.
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct Meta {
    pub(crate) id: String,

    /// A number simply counting up whenever we change the search index in a way
    /// that requires a rebuild.
    pub(crate) version: u32,

    /// A flag that is set to `true` while transitioning to a new index version.
    /// If the transition fails or is interrupted, the flag stays set and
    /// Tobira will rebuild again next time.
    pub(crate) dirty: bool,
}

impl Meta {
    pub(crate) const ID: &'static str = "meta";

    pub(crate) fn current_dirty() -> Self {
        Self {
            id: Self::ID.into(),
            version: VERSION,
            dirty: true,
        }
    }

    pub(crate) fn current_clean() -> Self {
        Self {
            id: Self::ID.into(),
            version: VERSION,
            dirty: false,
        }
    }
}

/// Versioning state of the index.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum IndexState {
    NoVersionInfo,
    BrokenVersionInfo,
    Info {
        dirty: bool,
        version: u32,
    },
}

impl IndexState {
    pub(crate) fn needs_rebuild(self) -> bool {
        match self {
            // Tobira versions that did not store any meta info were on version 1.
            IndexState::NoVersionInfo => VERSION != 1,
            IndexState::BrokenVersionInfo => true,
            IndexState::Info { dirty, version } => dirty || version != VERSION,
        }
    }

    pub(crate) async fn fetch(index: &Index) -> Result<Self> {
        let mut documents = index.get_documents::<serde_json::Value>(None, None, None)
            .await
            .context("failed to fetch search index meta info")?;

        if documents.is_empty() {
            return Ok(Self::NoVersionInfo);
        }

        if documents.len() > 1 {
            bail!("More than one document in meta search index");
        }

        match serde_json::from_value::<Meta>(documents.remove(0)) {
            Err(_) => Ok(Self::BrokenVersionInfo),
            Ok(Meta { version, dirty, .. }) => Ok(Self::Info { version, dirty }),
        }
    }
}
