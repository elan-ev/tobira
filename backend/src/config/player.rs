use crate::prelude::*;

#[derive(Debug, confique::Config)]
pub(crate) struct PlayerConfig {
    /// Additional Paella plugin configuration (JSON object). This is merged
    /// into the `plugins` object in the Tobira-internal Paella config.
    /// Warning: this could break Paella if used incorrectly. This is mostly
    /// intended to configure user tracking, e.g.:
    ///
    /// ```
    /// paella_plugin_config = """{
    ///     "es.upv.paella.userEventTracker": { ... },
    ///     "es.upv.paella.matomo.userTrackingDataPlugin": { ... }
    /// }"""
    /// ```
    #[config(default = "{}", deserialize_with = deserialize_paella_plugin_config)]
    pub paella_plugin_config: serde_json::Map<String, serde_json::Value>,
}

fn deserialize_paella_plugin_config<'de, D>(
    deserializer: D,
) -> Result<serde_json::Map<String, serde_json::Value>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::{Deserialize, de::Error};

    let s = String::deserialize(deserializer)?;
    serde_json::from_str(&s)
        .map_err(|e| D::Error::custom(format!("invalid JSON object: {e}")))
}
