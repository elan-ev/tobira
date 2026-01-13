use std::time::{Duration, Instant};

use bytes::Bytes;
use chrono::{DateTime, TimeZone, Utc};
use form_urlencoded::Serializer;
use hyper::{
    Response, Request, StatusCode,
    body::Incoming,
    http::{self, request, uri::Uri},
};
use hyper_rustls::HttpsConnector;
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use tap::TapFallible;

use crate::{
    api::{model::acl::AclInputEntry, Context},
    config::{Config, HttpHost},
    db::types::PlaylistEntry,
    model::OpencastId,
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
    auth_header: SecretString,
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
            auth_header: config.opencast.basic_auth_header(),
            username: config.opencast.user.clone(),
        })
    }

    pub(crate) async fn get_tobira_api_version(&self) -> Result<VersionResponse> {
        trace!("Sending request to '{}'", Self::VERSION_PATH);
        let (req, uri) = self.build_authed_req(&self.sync_node, Self::VERSION_PATH);

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
        let (req, uri) = self.build_authed_req(&self.sync_node, &pq);

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
        let (builder, _) = self.authed_req_builder(&self.external_api_node, Self::STATS_PATH);
        let req = builder
            .method(http::Method::POST)
            .header(http::header::CONTENT_TYPE, "application/json")
            .body(stats.into())
            .expect("failed to build request");

        self.http_client.request(req).await.map_err(Into::into)
    }

    pub async fn external_api_versions(&self) -> Result<ExternalApiVersions> {
        let (builder, uri) = self.authed_req_builder(&self.external_api_node, "/api/version");
        let req = builder
            .body(RequestBody::empty())
            .expect("failed to build request");
        let response = self.http_client.request(req)
            .await
            .with_context(|| format!("HTTP request failed (uri: '{uri}')"))?;

        let (out, _) = self.deserialize_response(response, &uri).await?;
        Ok(out)
    }

    pub async fn delete<T: OpencastItem>(&self, endpoint: &T) -> Result<Response<Incoming>> {
        let pq = format!(
            "/api/{endpoint}/{oc_id}",
            endpoint = endpoint.endpoint_path(),
            oc_id = endpoint.id(),
        );
        let (builder, _) = self.authed_req_builder(&self.external_api_node, &pq);
        let req = builder
            .method(http::Method::DELETE)
            .body(RequestBody::empty())
            .expect("failed to build request");

        self.http_client.request(req).await.map_err(Into::into)
    }

    pub async fn update_acl<T: OpencastItem>(
        &self,
        endpoint: &T,
        acl: &[AclInputEntry],
        context: &Context,
    ) -> Result<Response<Incoming>> {
        let oc_id = endpoint.id();
        let pq = format!("/api/{}/{oc_id}/acl", endpoint.endpoint_path());

        let mut access_policy = build_access_policy(acl);
        // Temporary solution to add custom and preview roles (`extra roles`).
        // Todo: remove again once frontend sends these roles.
        access_policy.extend(endpoint.extra_roles(context, oc_id).await?);

        let acl_json = serde_json::to_string(&access_policy).expect("Failed to serialize");

        let (req, _uri) = self.build_form_request(&pq, http::Method::PUT, &[("acl", &acl_json)]);
        self.http_client.request(req).await.map_err(Into::into)
    }

   pub async fn update_metadata<T: OpencastItem>(
        &self,
        endpoint: &T,
        metadata: &serde_json::Value,
    ) -> Result<Response<Incoming>> {
        let pq = format!(
            "/api/{endpoint}/{id}/metadata?type={flavor}",
            endpoint = endpoint.endpoint_path(),
            id = endpoint.id(),
            flavor = endpoint.metadata_flavor(),
        );

        let metadata_json = serde_json::to_string(metadata).expect("Failed to serialize");

        let (req, _uri) = self.build_form_request(&pq, http::Method::PUT, &[
            ("metadata", &metadata_json),
        ]);
        self.http_client.request(req).await.map_err(Into::into)
    }

    pub async fn start_workflow(&self, oc_id: &str, workflow_id: &str) -> Result<Response<Incoming>> {
        let (req, _uri) = self.build_form_request("/api/workflows", http::Method::POST, &[
            ("event_identifier", oc_id),
            ("workflow_definition_identifier", workflow_id),
        ]);
        self.http_client.request(req).await.map_err(Into::into)
    }

    pub async fn has_active_workflows(&self, oc_id: &str) -> Result<bool> {
        let pq = format!("/api/events/{oc_id}");
        let (builder, uri) = self.authed_req_builder(&self.external_api_node, &pq);
        let req = builder
            .body(RequestBody::empty())
            .expect("failed to build request");
        let response = self.http_client.request(req)
            .await
            .with_context(|| format!("HTTP request failed (uri: '{uri}')"))?;

        let (out, _) = self.deserialize_response::<EventStatus>(response, &uri).await?;
        Ok(out.processing_state == "RUNNING"
            || out.processing_state == "INSTANTIATED"
            || out.processing_state == "FAILING"
        )
    }

    pub async fn create_series(
        &self,
        acl: &[AclInputEntry],
        title: &str,
        description: Option<&str>,
    ) -> Result<CreateSeriesResponse> {
        let access_policy = build_access_policy(acl);

        let metadata = serde_json::json!([{
            "flavor": "dublincore/series",
            "fields": [
                {
                    "id": "title",
                    "value": title
                },
                {
                    "id": "description",
                    "value": description
                },
            ]
        }]);

        let acl_json = serde_json::to_string(&access_policy).expect("Failed to serialize");
        let metadata_json = serde_json::to_string(&metadata).expect("Failed to serialize");

        let (req, uri) = self.build_form_request("/api/series", http::Method::POST, &[
            ("acl", &acl_json),
            ("metadata", &metadata_json),
        ]);
        let response = self.http_client.request(req).await
            .with_context(|| format!("HTTP request failed (uri: '{uri}'"))?;

        let (out, _) = self.deserialize_response::<CreateSeriesResponse>(response, &uri).await?;

        Ok(out)
    }


    pub async fn create_playlist(
        &self,
        title: &str,
        description: Option<&str>,
        creator: &str,
        entries: &[OpencastId],
        acl: &[AclInputEntry],
    ) -> Result<CreatePlaylistResponse> {
        let access_policy = build_access_policy(acl);

        let playlist = serde_json::json!({
            "title": title,
            "description": description,
            "creator": creator,
            "entries": entries_to_json(entries),
            "accessControlEntries": access_policy,
        });

        let playlist_json = serde_json::to_string(&playlist).expect("Failed to serialize");

        let (req, uri) = self.build_form_request("/api/playlists/", http::Method::POST, &[
            ("playlist", &playlist_json),
        ]);
        let response = self.http_client.request(req).await
            .with_context(|| format!("HTTP request failed (uri: '{uri}'"))?;

        let (out, _) = self.deserialize_response::<CreatePlaylistResponse>(response, &uri).await?;

        Ok(out)
    }

    pub async fn update_playlist(
        &self,
        playlist_id: OpencastId,
        title: Option<&str>,
        description: Option<&str>,
        entries: Option<&[OpencastId]>,
        acl: Option<&[AclInputEntry]>,
    ) -> Result<CreatePlaylistResponse> {
        let mut payload = serde_json::Map::new();

        if let Some(title) = title {
            payload.insert("title".into(), title.into());
        }

        if let Some(description) = description {
            payload.insert("description".into(), description.into());
        }

        if let Some(entries) = entries {
            payload.insert("entries".into(), entries_to_json(entries));
        }

        if let Some(acl_entries) = acl {
            payload.insert(
                "accessControlEntries".into(),
                serde_json::to_value(build_access_policy(acl_entries))?,
            );
        }

        let playlist_json = serde_json::to_string(&payload)?;

        let pq = format!("/api/playlists/{playlist_id}");
        let (req, uri) = self.build_form_request(&pq, http::Method::PUT, &[
            ("playlist", &playlist_json),
        ]);
        let response = self.http_client.request(req).await
            .with_context(|| format!("HTTP request failed (uri: '{uri}')"))?;

        let (out, _) = self.deserialize_response::<CreatePlaylistResponse>(response, &uri).await?;

        Ok(out)
    }

    fn authed_req_builder(&self, node: &HttpHost, path_and_query: &str) -> (request::Builder, Uri) {
        let uri = Uri::builder()
            .scheme(node.scheme.clone())
            .authority(node.authority.clone())
            .path_and_query(path_and_query)
            .build()
            .expect("bug: failed to build URI");
        let builder = Request::builder()
            .uri(&uri)
            .header("Authorization", self.auth_header.expose_secret());
        (builder, uri)
    }

    fn build_authed_req(&self, node: &HttpHost, path_and_query: &str) -> (Request<RequestBody>, Uri) {
        let (builder, uri) = self.authed_req_builder(node, path_and_query);
        let req = builder
            .body(RequestBody::empty())
            .expect("bug: failed to build request");
        (req, uri)
    }

    fn form_encoded_req_builder(
        &self,
        node: &HttpHost,
        path_and_query: &str,
        method: http::Method,
    ) -> (request::Builder, Uri) {
        let (builder, uri) = self.authed_req_builder(node, path_and_query);
        let builder = builder
            .method(method)
            .header(http::header::CONTENT_TYPE, "application/x-www-form-urlencoded");
        (builder, uri)
    }

    fn build_form_request(&self, path_and_query: &str, method: http::Method, params: &[(&str, &str)]) -> (Request<RequestBody>, Uri) {
        let mut serializer = Serializer::new(String::new());
        for (key, value) in params {
            serializer.append_pair(key, value);
        }
        let encoded = serializer.finish();

        let (builder, uri) = self.form_encoded_req_builder(&self.external_api_node, path_and_query, method);
        let req = builder
            .body(encoded.into())
            .expect("failed to build request");
        (req, uri)
    }

    async fn deserialize_response<T: for<'de> serde::Deserialize<'de>>(
        &self,
        response: Response<Incoming>,
        uri: &Uri,
    ) -> Result<(T, usize)> {
        let (parts, body) = response.into_parts();
        let body = download_body(body).await
            .with_context(|| format!("failed to download body from '{uri}'"))?;

        if parts.status != StatusCode::OK && parts.status != StatusCode::CREATED {
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

/// ACL structure used in Opencast (different from the structure used in Tobira)
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct AclInput {
    pub allow: bool,
    pub action: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateSeriesResponse {
    pub identifier: OpencastId,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlaylistResponse {
    pub id: OpencastId,
    pub entries: Vec<PlaylistEntry>,
    pub title: String,
    pub description: Option<String>,
    pub creator: String,
    #[serde(rename = "accessControlEntries")]
    pub acl: Vec<AclInput>,
}

#[derive(Debug, Deserialize)]
pub struct EventStatus {
    pub processing_state: String,
}

/// Trait for items that can be harvested from Opencast.
/// Their api endpoint paths generally share the same structure (`/api/{endpoint_path}/{id}/...`).
/// Implementing the below methods helps with making some endpoints like `update_acl` and
/// `update_metadata` generic by just passing the item instead of multiple props.
/// Playlists however only use the generic `delete` endpoint.
pub(crate) trait OpencastItem {
    /// Name used in endpoint path.
    fn endpoint_path(&self) -> &'static str;
    /// Opencast ID of the item.
    fn id(&self) -> &str; // TODO: also change to OpencastId?
    /// Metadata flavor needed for the `update_metadata` endpoint of the item
    /// (i.e. `dublincore/series` or `dublincore/episode`).
    fn metadata_flavor(&self) -> &'static str;
    /// Preview and custom roles of an item. Only used for the acl endpoint of events.
    /// Frontend doesn't send these roles yet, so they need to be queried and added manually.
    /// This technically doesn't belong and maybe shouldn't be here.
    /// But it's a temporary solution and having this in the trait helps to keep the acl
    /// code at least *somewhat* lean.
    async fn extra_roles(&self, context: &Context, oc_id: &str) -> Result<Vec<AclInput>>;
}


/// Builds the Opencast ACL from the input structure used in Tobira.
pub(crate) fn build_access_policy(acl: &[AclInputEntry]) -> Vec<AclInput> {
    acl
        .iter()
        .flat_map(|entry| {
            entry.actions.iter().map(|action| AclInput {
                allow: true,
                action: action.clone(),
                role: entry.role.clone(),
            })
        })
        .collect()
}

/// Maps a collection of content IDs to the JSON structure expected by the Opencast API.
fn entries_to_json(ids: &[OpencastId]) -> serde_json::Value {
    serde_json::Value::Array(
        ids
            .iter()
            .map(|e| {
                serde_json::json!({
                    "contentId": e,
                    "type": "EVENT",
                })
            })
            .collect()
    )
}
