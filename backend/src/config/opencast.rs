
use secrecy::{ExposeSecret as _, SecretString};

use crate::{
    prelude::*,
    util::{self, HttpHost, HttpUrl},
};


#[derive(Debug, confique::Config)]
#[config(validate = Self::validate)]
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
    #[config(validate = HttpUrl::ensure_no_fragment, validate = HttpUrl::ensure_no_query)]
    pub(crate) studio_url: Option<HttpUrl>,

    /// Explicitly set the base-URL to the Opencast editor.
    ///
    /// Example: "https://admin.oc.my-uni.edu/editor-ui/index.html".
    #[config(validate = HttpUrl::ensure_no_fragment, validate = HttpUrl::ensure_no_query)]
    pub(crate) editor_url: Option<HttpUrl>,

    /// Extra Opencast hosts not listed in any other value above, that can also
    /// be trusted.
    #[config(default = [])]
    pub(crate) other_hosts: Vec<HttpHost>,

    /// Username of the user used to communicate with Opencast for data syncing
    /// and external API authentication.
    /// This user has to have access to all events and series. Currently, that
    /// user has to be admin.
    pub user: String,

    /// Password of the user used to communicate with Opencast.
    password: SecretString,

    /// ID of the workflow used to republish metadata.
    #[config(default = "republish-metadata")]
    pub(crate) republish_workflow_id: String,

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

    pub(crate) fn studio_url(&self) -> HttpUrl {
        self.studio_url.clone().unwrap_or_else(|| {
            self.unwrap_host().clone().url_with_path("/studio")
        })
    }

    pub(crate) fn editor_url(&self) -> HttpUrl {
        self.editor_url.clone().unwrap_or_else(|| {
            self.unwrap_host().clone().url_with_path("/editor-ui/index.html")
        })
    }

    pub(crate) fn basic_auth_header(&self) -> SecretString {
        util::basic_auth_header(&self.user, self.password.expose_secret())
    }

    pub(crate) fn trusted_hosts(&self) -> Vec<HttpHost> {
        self.other_hosts.iter()
            .chain(self.host.as_ref())
            .chain(self.sync_node.as_ref())
            .chain(self.upload_node.as_ref())
            .cloned()
            .collect()
    }

    fn unwrap_host(&self) -> &HttpHost {
        self.host.as_ref().expect("Neither 'opencast.host' nor override host set!")
    }
}
