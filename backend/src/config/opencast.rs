use std::{str::FromStr, fmt};

use hyper::Uri;
use serde::Deserialize;

use crate::{
    prelude::*,
    config::HttpHost,
};


#[derive(Debug, confique::Config)]
pub(crate) struct OpencastConfig {
    /// URL to Opencast. Currently used for all purposes (syncing, Studio,
    /// upload, ...) unless overwritten below. In the future, Tobira might use
    /// the service registry API to figure out suitable nodes for each
    /// purpose (again, unless explicitly specified below).
    ///
    /// Some HTTP requests to Opencast contain the unencrypted `sync.password`,
    /// so using HTTPS is strongly encouraged. In fact, HTTP is only allowed if
    /// the host resolves to a loopback address.
    ///
    /// Example: "http://localhost:8080" or "https://oc.my-uni.edu".
    pub(crate) host: Option<HttpHost>,

    /// Explicitly set Opencast node used for data synchronization. The Tobira
    /// module needs to run on this node.
    pub(crate) sync_node: Option<HttpHost>,

    /// Explicitly set Opencast node used for the video uploader. Has to offer
    /// the ingest API.
    pub(crate) upload_node: Option<HttpHost>,

    /// Explicitly set Opencast node for "external API" use (used to modify
    /// Opencast data from Tobira).
    pub(crate) external_api_node: Option<HttpHost>,

    /// Explicitly set base-URL to Opencast Studio.
    ///
    /// Example: "https://admin.oc.my-uni.edu/studio".
    pub(crate) studio_url: Option<ToolBaseUri>,

    /// Explicitly set the base-URL to the Opencast editor.
    ///
    /// Example: "https://admin.oc.my-uni.edu/editor-ui/index.html".
    pub(crate) editor_url: Option<ToolBaseUri>,
}

impl OpencastConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        let all_overrides_set = self.sync_node.is_some()
            && self.upload_node.is_some()
            && self.studio_url.is_some()
            && self.editor_url.is_some();

        if self.host.is_some() && all_overrides_set {
            bail!("If all overrides in `opencast` are set, `opencast.host` is \
                unused and thus must be unset");
        }
        if self.host.is_none() && !all_overrides_set {
            bail!("Either `opencast.host` or all specific overrides in `opencast` must be set");
        }

        Ok(())
    }

    pub(crate) fn sync_node(&self) -> &HttpHost {
        self.sync_node.as_ref().unwrap_or_else(|| self.unwrap_host())
    }

    pub(crate) fn upload_node(&self) -> &HttpHost {
        self.upload_node.as_ref().unwrap_or_else(|| self.unwrap_host())
    }

    pub(crate) fn external_api_node(&self) -> &HttpHost {
        self.external_api_node.as_ref().unwrap_or_else(|| self.unwrap_host())
    }

    pub(crate) fn studio_url(&self) -> ToolBaseUri {
        self.studio_url.clone().unwrap_or_else(|| {
            let host = self.unwrap_host();
            let uri = Uri::builder()
                .scheme(host.scheme.clone())
                .authority(host.authority.clone())
                .path_and_query("/studio")
                .build()
                // This is fine since scheme and host come from a trusted source
                // and the path is known to be fine statically.
                .unwrap();
            ToolBaseUri(uri)
        })
    }

    pub(crate) fn editor_url(&self) -> ToolBaseUri {
        self.editor_url.clone().unwrap_or_else(|| {
            let host = self.unwrap_host();
            let uri = Uri::builder()
                .scheme(host.scheme.clone())
                .authority(host.authority.clone())
                .path_and_query("/editor-ui/index.html")
                .build()
                // This is fine since scheme and host come from a trusted source
                // and the path is known to be fine statically.
                .unwrap();
            ToolBaseUri(uri)
        })
    }

    fn unwrap_host(&self) -> &HttpHost {
        self.host.as_ref().expect("Neither 'opencast.host' nor override host set!")
    }
}

/// A base URL for tools like Studio or the editor. A URI without query and
/// fragment.
#[derive(Clone, Deserialize)]
#[serde(try_from = "String")]
pub(crate) struct ToolBaseUri(pub(crate) Uri);


impl fmt::Display for ToolBaseUri {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl fmt::Debug for ToolBaseUri {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl TryFrom<String> for ToolBaseUri {
    type Error = <Self as FromStr>::Err;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl FromStr for ToolBaseUri {
    type Err = anyhow::Error;
    fn from_str(src: &str) -> Result<Self, Self::Err> {
        let uri = src.parse::<hyper::http::uri::Uri>()?;
        if uri.query().is_some() {
            bail!("URL cannot have a query component!");
        }

        // Check for fragment component. `Uri` actually doesn't store the
        // fragment component for some reason. We check it manually, but this
        // should be correct:
        // - query, path and even authority could be delimited by `#`, so they
        //   cannot contain that symbol.
        // - Scheme is defined as: `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`
        if src.contains('#') {
            bail!("URL cannot have a fragment component!");
        }

        Ok(Self(uri))
    }
}
