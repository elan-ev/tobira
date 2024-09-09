use std::time::{Duration, Instant};

use bytes::Bytes;
use chrono::{DateTime, Utc, TimeZone};
use hyper::{
    Response, Request, StatusCode,
    body::Incoming,
    http::{self, request, uri::Uri},
};
use hyper_rustls::HttpsConnector;
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use secrecy::{ExposeSecret, Secret};
use serde::Deserialize;
use tap::TapFallible;

use crate::{
    config::{Config, HttpHost},
    prelude::*,
    sync::harvest::HarvestResponse,
    util::download_body,
};

use super::VersionResponse;

// Most requests have an empty body, but sending stats requires sending data in
// the body.
type RequestBody = http_body_util::Full<Bytes>;

/// Used to send request to the harvesting API.
pub(crate) struct OcClient {
    http_client: Client<HttpsConnector<HttpConnector>, RequestBody>,
    sync_node: HttpHost,
    external_api_node: HttpHost,
    auth_header: Secret<String>,
    username: String,
}

impl OcClient {
    const HARVEST_PATH: &'static str = "/tobira/harvest";
    const VERSION_PATH: &'static str = "/tobira/version";
    const STATS_PATH: &'static str = "/tobira/stats";

    pub(crate) fn new(config: &Config) -> Result<Self> {
        Ok(Self {
            http_client: crate::util::http_client()?,
            sync_node: config.opencast.sync_node().clone(),
            external_api_node: config.opencast.external_api_node().clone(),
            auth_header: config.sync.basic_auth_header(),
            username: config.sync.user.clone(),
        })
    }

    pub(crate) async fn get_tobira_api_version(&self) -> Result<VersionResponse> {
        trace!("Sending request to '{}'", Self::VERSION_PATH);
        let (uri, req) = self.build_authed_req(&self.sync_node, Self::VERSION_PATH);

        let response = self.http_client.request(req)
            .await
            .with_context(|| format!("HTTP request failed (to '{uri}')"))?;

        let (out, _) = self.deserialize_response(response, &uri).await?;
        Ok(out)
    }

    pub(crate) async fn test_harvest(&self) -> Result<()> {
        // `timestamp_opt(0, 0)` should only ever be `Single(...)`, so `unwrap` is fine
        self.send_harvest(Utc.timestamp_opt(0, 0).unwrap(), 2).await
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
        let (uri, req) = self.build_authed_req(&self.sync_node, &pq);

        trace!("Sending harvest request (since = {:?}): GET {}", since, uri);

        let response = tokio::time::timeout(Duration::from_secs(60), self.http_client.request(req))
            .await
            .with_context(|| format!("Harvest request timed out (to '{uri}')"))?
            .with_context(|| format!("Harvest request failed (to '{uri}')"))?;

        let (out, body_len) = self.deserialize_response::<HarvestResponse>(response, &uri).await?;

        if out.items.len() > 0 {
            debug!(
                "Received {} KiB ({} items) from the harvest API (in {:.2?}, since = {:?})",
                body_len / 1024,
                out.items.len(),
                before.elapsed(),
                since,
            );
        } else {
            trace!(
                "Received 0 items from harvest API (in {:.2?}, since = {:?})",
                before.elapsed(),
                since,
            );
        }

        Ok(out)
    }

    /// Sends the given serialized JSON to the `/stats` endpoint in Opencast.
    pub async fn send_stats(&self, stats: String) -> Result<Response<Incoming>> {
        // TODO: maybe introduce configurable node for this
        let req = self.authed_req_builder(&self.external_api_node, Self::STATS_PATH)
            .method(http::Method::POST)
            .header(http::header::CONTENT_TYPE, "application/json")
            .body(stats.into())
            .expect("failed to build request");

        self.http_client.request(req).await.map_err(Into::into)
    }

    pub async fn external_api_versions(&self) -> Result<ExternalApiVersions> {
        let req = self.authed_req_builder(&self.external_api_node, "/api/version")
            .body(RequestBody::empty())
            .expect("failed to build request");
        let uri = req.uri().clone();
        let response = self.http_client.request(req)
            .await
            .with_context(|| format!("HTTP request failed (uri: '{uri}')"))?;

        let (out, _) = self.deserialize_response(response, &uri).await?;
        Ok(out)
    }

    pub async fn delete_event(&self, oc_id: &String) -> Result<Response<Incoming>> {
        let pq = format!("/api/events/{}", oc_id);
        let req = self.authed_req_builder(&self.external_api_node, &pq)
            .method(http::Method::DELETE)
            .body(RequestBody::empty())
            .expect("failed to build request");

        self.http_client.request(req).await.map_err(Into::into)
    }

    fn build_authed_req(&self, node: &HttpHost, path_and_query: &str) -> (Uri, Request<RequestBody>) {
        let req = self.authed_req_builder(node, path_and_query)
            .body(RequestBody::empty())
            .expect("bug: failed to build request");

        (req.uri().clone(), req)
    }

    fn authed_req_builder(&self, node: &HttpHost, path_and_query: &str) -> request::Builder {
        self.req_builder(node, path_and_query)
            .header("Authorization", self.auth_header.expose_secret())
    }

    fn req_builder(&self, node: &HttpHost, path_and_query: &str) -> request::Builder {
        let uri = Uri::builder()
            .scheme(node.scheme.clone())
            .authority(node.authority.clone())
            .path_and_query(path_and_query)
            .build()
            .expect("bug: failed build URI");

        Request::builder().uri(&uri)
    }

    async fn deserialize_response<T: for<'de> serde::Deserialize<'de>>(
        &self,
        response: Response<Incoming>,
        uri: &Uri,
    ) -> Result<(T, usize)> {
        let (parts, body) = response.into_parts();
        let body = download_body(body).await
            .with_context(|| format!("failed to download body from '{uri}'"))?;

        if parts.status != StatusCode::OK {
            trace!("HTTP response: {:#?}", parts);
            if parts.status == StatusCode::UNAUTHORIZED {
                bail!(
                    "Requesting '{}' with login '{}:******' returned {}. \
                        Check 'sync.user' and 'sync.password'!",
                    uri, self.username, parts.status,
                );
            } else {
                bail!(
                    "API returned unexpected HTTP code {} (for '{}', authenticating as '{}')",
                    parts.status, uri, self.username,
                );
            }
        }

        let out = serde_json::from_slice::<T>(&body)
            .with_context(|| format!("Failed to deserialize API response from {uri}"))
            .tap_err(|_| trace!("HTTP response: {:#?}", parts))?;

        Ok((out, body.len()))
    }
}

#[derive(Deserialize)]
pub struct ExternalApiVersions {
    pub default: String,
    pub versions: Vec<String>,
}
