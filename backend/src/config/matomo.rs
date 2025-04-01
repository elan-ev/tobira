use hyper::Uri;

use crate::prelude::*;


#[derive(Debug, confique::Config)]
pub(crate) struct MatomoConfig {
    /// URL of your Matomo server. Example: "https://matomo.myuni.edu/matomo/".
    ///
    /// Note: Adding the filename of the Matomo script to the URL configured here should result in
    /// a URL to a publicly accessible JS file.
    #[config(deserialize_with = deserialize_server)]
    pub(crate) server: Option<Uri>,

    /// Matomo site ID, e.g. `side_id = "1"`
    pub(crate) site_id: Option<String>,

    /// Filename for the Matomo JS script.
    #[config(default = "matomo.js")]
    pub(crate) tracker_url_js: String,

    /// Filename for the Matomo PHP endpoint.
    #[config(default = "matomo.php")]
    pub(crate) tracker_url_php: String,
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
              _paq.push(['setTrackerUrl', u+'{php}']);
              _paq.push(['setSiteId', '{site_id}']);
              var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
              g.async=true; g.src=u+'{js}'; s.parentNode.insertBefore(g,s);
            }})();
        "#,
            php = self.tracker_url_php,
            js = self.tracker_url_js,
        );

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
