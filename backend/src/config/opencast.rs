use crate::{
    prelude::*,
    util::HttpHost,
};


#[derive(Debug, confique::Config)]
pub(crate) struct OpencastConfig {
    /// URL of the connected Opencast instance that runs the Tobira module.
    ///
    /// Some HTTP requests to Opencast contain the unencrypted `sync.password`,
    /// so using HTTPS is strongly encouraged. In fact, HTTP is only allowed if
    /// the host resolves to a loopback address.
    ///
    /// Example: "http://localhost:8080" or "https://oc.my-uni.edu".
    pub(crate) host: HttpHost,
}

impl OpencastConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        self.host.assert_safety().context("failed to validate 'opencast.host'")?;
        Ok(())
    }
}
