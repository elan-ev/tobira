use std::time::{Duration, Instant};

use chrono::{DateTime, Utc, TimeZone};
use hyper::{
    Body, Request, Response, StatusCode,
    client::{Client, HttpConnector},
    http::uri::{Authority, Scheme, Uri},
};
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use secrecy::{ExposeSecret, Secret};
use tap::TapFallible;

use crate::{
    prelude::*,
    config::Config,
    sync::harvest::HarvestResponse,
};

use super::VersionResponse;


/// Used to send request to the harvesting API.
pub(crate) struct OcClient {
    http_client: Client<HttpsConnector<HttpConnector>, Body>,
    scheme: Scheme,
    authority: Authority,
    auth_header: Secret<String>,
}

impl OcClient {
    const HARVEST_PATH: &'static str = "/tobira/harvest";
    const VERSION_PATH: &'static str = "/tobira/version";

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

    pub(crate) async fn get_version(&self) -> Result<VersionResponse> {
        trace!("Sending request to '{}'", Self::VERSION_PATH);
        let (uri, req) = self.build_req(Self::VERSION_PATH);

        let response = self.http_client.request(req)
            .await
            .with_context(|| format!("HTTP request failed (to '{uri}')"))?;

        let (out, _) = Self::deserialize_response(response, &uri).await?;
        Ok(out)
    }

    pub(crate) async fn test_harvest(&self) -> Result<()> {
        self.send_harvest(Utc.timestamp(0, 0), 2).await
            .map(|_| ())
            .context("test harvest request failed")
    }

    /// Sends a request to the harvesting API, checks and deserializes the
    /// response.
    pub(super) async fn send_harvest(
        &self,
        since: DateTime<Utc>,
        preferred_amount: u64,
    ) -> Result<HarvestResponse> {
        let before = Instant::now();

        let pq = format!(
            "{}?since={}&preferredAmount={}",
            Self::HARVEST_PATH,
            since.timestamp_millis(),
            preferred_amount,
        );
        let (uri, req) = self.build_req(&pq);

        debug!("Sending harvest request (since = {:?}): GET {}", since, uri);

        let response = tokio::time::timeout(Duration::from_secs(60), self.http_client.request(req))
            .await
            .with_context(|| format!("Harvest request timed out (to '{uri}')"))?
            .with_context(|| format!("Harvest request failed (to '{uri}')"))?;

        let (out, body_len) = Self::deserialize_response::<HarvestResponse>(response, &uri).await?;
        debug!(
            "Received {} KiB ({} items) from the harvest API (in {:.2?})",
            body_len,
            out.items.len(),
            before.elapsed(),
        );

        Ok(out)
    }

    fn build_req(&self, path_and_query: &str) -> (Uri, Request<Body>) {
        let uri = Uri::builder()
            .scheme(self.scheme.clone())
            .authority(self.authority.clone())
            .path_and_query(path_and_query)
            .build()
            .expect("bug: failed build URI");

        let req = Request::builder()
            .uri(&uri)
            .header("Authorization", self.auth_header.expose_secret())
            .body(Body::empty())
            .expect("bug: failed to build request");

        (uri, req)
    }

    async fn deserialize_response<T: for<'de> serde::Deserialize<'de>>(
        response: Response<Body>,
        uri: &Uri,
    ) -> Result<(T, usize)> {
        let (parts, body) = response.into_parts();
        let body = hyper::body::to_bytes(body).await
            .with_context(|| format!("failed to download body from '{uri}'"))?;

        if parts.status != StatusCode::OK {
            trace!("HTTP response: {:#?}", parts);
            bail!("API returned unexpected HTTP code {} (for '{}')", parts.status, uri);
        }

        let out = serde_json::from_slice::<T>(&body)
            .with_context(|| format!("Failed to deserialize API response from {uri}"))
            .tap_err(|_| trace!("HTTP response: {:#?}", parts))?;

        Ok((out, body.len()))
    }
}
