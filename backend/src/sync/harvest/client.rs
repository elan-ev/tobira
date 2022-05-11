use std::time::{Duration, Instant};

use chrono::{DateTime, Utc, TimeZone};
use hyper::{
    Request, Body,
    client::{Client, HttpConnector},
    http::uri::{Authority, Scheme, Uri},
    StatusCode
};
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use secrecy::{ExposeSecret, Secret};
use tap::TapFallible;

use crate::{prelude::*, config::Config};
use super::HarvestResponse;


/// Used to send request to the harvesting API.
pub(crate) struct HarvestClient {
    http_client: Client<HttpsConnector<HttpConnector>, Body>,
    scheme: Scheme,
    authority: Authority,
    auth_header: Secret<String>,
}

impl HarvestClient {
    const API_PATH: &'static str = "/tobira/harvest";

    pub(crate) fn new(config: &Config) -> Self {
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

    pub(crate) async fn test_connection(&self) -> Result<()> {
        self.send(Utc.timestamp(0, 0), 2).await
            .map(|_| ())
            .context("test harvest request failed")
    }

    /// Sends a request to the harvesting API, checks and deserializes the
    /// response.
    pub(super) async fn send(
        &self,
        since: DateTime<Utc>,
        preferred_amount: u64,
    ) -> Result<HarvestResponse> {
        let before = Instant::now();

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

        let response = tokio::time::timeout(Duration::from_secs(60), self.http_client.request(req))
            .await
            .with_context(|| format!("Harvest request timed out (to '{uri}')"))?
            .with_context(|| format!("Harvest request failed (to '{uri}')"))?;

        let (parts, body) = response.into_parts();
        let body = hyper::body::to_bytes(body).await
            .with_context(|| format!("failed to download body from '{uri}'"))?;

        if parts.status != StatusCode::OK {
            trace!("HTTP response: {:#?}", parts);
            bail!("Harvest API returned unexpected HTTP code {}", parts.status);
        }

        let out = serde_json::from_slice::<HarvestResponse>(&body)
            .context("Failed to deserialize response from harvesting API")
            .tap_err(|_| trace!("HTTP response: {:#?}", parts))?;

        debug!(
            "Received {} KiB ({} items) from the harvest API (in {:.2?})",
            body.len() / 1024,
            out.items.len(),
            before.elapsed(),
        );

        Ok(out)
    }
}
