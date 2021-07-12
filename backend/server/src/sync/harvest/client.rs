use std::{net::Ipv6Addr, time::Duration};

use chrono::{DateTime, Utc};
use hyper14::{
    Request, Body,
    body::Bytes,
    client::{Client, HttpConnector},
    http::{
        response,
        uri::{Authority, Scheme, Uri},
    }
};
use hyper_tls::HttpsConnector;
use secrecy::{ExposeSecret, Secret};

use tobira_util::prelude::*;
use crate::config::Config;



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
        let http_client = Client::builder().build(HttpsConnector::new());

        // Prepare URL
        let scheme = if config.opencast.use_insecure_connection {
            Scheme::HTTP
        } else {
            Scheme::HTTPS
        };
        let host = if config.opencast.host.parse::<Ipv6Addr>().is_ok() {
            format!("[{}]", config.opencast.host)
        } else {
            config.opencast.host.clone()
        };
        let authority = host.parse::<Authority>().expect("bug: invalid config");

        // Prepare authentication
        let credentials = format!(
            "{}:{}",
            config.opencast.sync_user,
            config.opencast.sync_password.expose_secret(),
        );
        let auth_header = format!("Basic {}", base64::encode(credentials));

        Self {
            http_client,
            scheme,
            authority,
            auth_header: Secret::new(auth_header),
        }
    }

    /// Sends a request to the harvesting API. Returns the response "meta data"
    /// and the downloaded response body.
    pub(super) async fn send(
        &self,
        since: DateTime<Utc>,
        limit: u64,
    ) -> Result<(response::Parts, Bytes)> {
        let pq = format!(
            "{}?since={}&limit={}",
            Self::API_PATH,
            since.timestamp_millis(),
            limit,
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
        let body = hyper14::body::to_bytes(body).await
            .with_context(|| format!("failed to download body from {}", uri))?;
        Ok((parts, body))
    }
}
