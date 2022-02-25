use std::{collections::HashMap, fmt};
use serde::Deserialize;


/// A configurable string specified in different languages. Language 'en' always
/// has to be specified.
#[derive(serde::Serialize, Clone)]
pub(crate) struct TranslatedString(HashMap<String, String>);

impl TranslatedString {
    pub(crate) const LANGUAGES: &'static [&'static str] = &["en", "de"];

    pub(crate) fn to_json(&self) -> String {
        serde_json::to_string(&self.0)
            .expect("serialization of translated string failed")
    }

    pub(crate) fn en(&self) -> &str {
        &self.0["en"]
    }
}

impl<'de> Deserialize<'de> for TranslatedString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error;

        let map = <HashMap<String, String>>::deserialize(deserializer).map_err(|e| {
            D::Error::custom(format!(
                "invalid translated string, expected object with keys 'en', 'de', ... ({})",
                e,
            ))
        })?;

        // Make sure only valid languages are specified
        if let Some(invalid) = map.keys().find(|key| !Self::LANGUAGES.contains(&key.as_str())) {
            return Err(D::Error::custom(format!(
                "'{}' is not a valid language key for translated string (valid keys: {:?})",
                invalid,
                Self::LANGUAGES,
            )));
        }

        if !map.contains_key("en") {
            return Err(D::Error::custom(
                "translated string not specified for language 'en', but it has to be"
            ));
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
