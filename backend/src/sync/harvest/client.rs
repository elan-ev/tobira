use std::time::Duration;

use chrono::{DateTime, Utc};
use hyper::{
    Request, Body,
    body::Bytes,
    client::{Client, HttpConnector},
    http::{
        response,
        uri::{Authority, Scheme, Uri},
    }
};
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use secrecy::{ExposeSecret, Secret};

use crate::{prelude::*, config::Config};


/// Used to send request to the harvesting API.
pub(super) struct HarvestClient {
    http_client: Client<HttpsConnector<HttpConnector>, Body>,
    scheme: Scheme,
    authority: Authority,
    auth_header: Secret<String>,
}

impl HarvestClient {
    const API_PATH: &'static str = "/tobira/harvest";

    pub(super) fn new(config: &Config) -> Self {
        // Prepare HTTP client
        let https = HttpsConnectorBuilder::new()
            .with_native_roots()
            .https_or_http()
            .enable_http1()
            .enable_http2()
            .build();
        let http_client = Client::builder().build(https);

        // Prepare authentication
        let credentials = format!(
            "{}:{}",
            config.sync.user,
            config.sync.password.expose_secret(),
        );
        let auth_header = format!("Basic {}", base64::encode(credentials));

        Self {
            http_client,
            scheme: config.opencast.sync_node().scheme.clone(),
            authority: config.opencast.sync_node().authority.clone(),
            auth_header: Secret::new(auth_header),
        }
    }

    /// Sends a request to the harvesting API. Returns the response "meta data"
    /// and the downloaded response body.
    pub(super) async fn send(
        &self,
        since: DateTime<Utc>,
        preferred_amount: u64,
    ) -> Result<(response::Parts, Bytes)> {
        let pq = format!(
            "{}?since={}&preferredAmount={}",
            Self::API_PATH,
            since.timestamp_millis(),
            preferred_amount,
        );

        let uri = Uri::builder()
            .scheme(self.scheme.clone())
            .authority(self.authority.clone())
            .path_and_query(&*pq)
            .build()
            .expect("bug: failed build URI");

        let req = Request::builder()
            .uri(&uri)
            .header("Authorization", self.auth_header.expose_secret())
            .body(Body::empty())
            .expect("bug: failed to build request");

        debug!("Sending harvest request (since = {:?}): GET {}", since, uri);

        let response = tokio::time::timeout(Duration::from_secs(60), self.http_client.request(req)).await
            .with_context(|| format!("client request timed out"))?
            .with_context(|| format!("failed to GET {}", uri))?;

        let (parts, body) = response.into_parts();
        let body = hyper::body::to_bytes(body).await
            .with_context(|| format!("failed to download body from {}", uri))?;
        Ok((parts, body))
    }
}
