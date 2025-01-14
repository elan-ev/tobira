use std::{collections::HashMap, fmt};
use serde::{Deserialize, Serialize};
use anyhow::{anyhow, Error};

/// A configurable string specified in different languages. Language 'en' always
/// has to be specified.
#[derive(Serialize, Deserialize, Clone)]
#[serde(try_from = "HashMap<LangKey, String>")]
pub(crate) struct TranslatedString(HashMap<LangKey, String>);

impl TranslatedString {
    pub(crate) fn default(&self) -> &str {
        &self.0[&LangKey::Default]
    }
}

impl TryFrom<HashMap<LangKey, String>> for TranslatedString {
    type Error = Error;

    fn try_from(map: HashMap<LangKey, String>) -> Result<Self, Self::Error> {
        if !map.contains_key(&LangKey::Default) {
            return Err(anyhow!("Translated string must include 'default' entry."));
        }

        Ok(Self(map))
    }
}

impl fmt::Debug for TranslatedString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("TranslatedString ")?;
        f.debug_map().entries(self.0.iter()).finish()
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Debug)]
#[serde(rename_all = "lowercase")]
pub(crate) enum LangKey {
    #[serde(alias = "*")]
    Default,
    En,
    De,
}

impl fmt::Display for LangKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(f)
    }
}
