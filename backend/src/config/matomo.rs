use hyper::Uri;

use crate::prelude::*;


#[derive(Debug, confique::Config)]
pub(crate) struct MatomoConfig {
    /// URL of your Matomo server. This URL + `matomo.js` should be a publicly
    /// accessible JS file. Example: "https://matomo.myuni.edu/matomo/".
    #[config(deserialize_with = deserialize_server)]
    pub(crate) server: Option<Uri>,

    /// Matomo site ID, e.g. `side_id = "1"`
    pub(crate) site_id: Option<String>,
}

impl MatomoConfig {
    /// Returns the JS code for initializing the Matomo tracking or `None` if
    /// Matomo is not configured.
    pub(crate) fn js_code(&self) -> Option<String> {
        let (Some(server), Some(site_id)) = (&self.server, &self.site_id) else {
            return None;
        };

        let out = format!(r#"
            // Matomo tracking code
            var _paq = window._paq = window._paq || [];
            /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
            _paq.push(['trackPageView']);
            _paq.push(['enableLinkTracking']);
            (function() {{
              var u="{server}";
              _paq.push(['setTrackerUrl', u+'matomo.php']);
              _paq.push(['setSiteId', '{site_id}']);
              var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
              g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
            }})();
        "#);

        // Fix indentation, super duper important.
        Some(out.replace("\n            ", "\n      "))
    }
}

fn deserialize_server<'de, D>(deserializer: D) -> Result<Uri, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::{Deserialize, de::Error};

    let uri: Uri = String::deserialize(deserializer)?
        .parse()
        .map_err(|e| D::Error::custom(format!("invalid URL: {e}")))?;

    Ok(uri)
}
