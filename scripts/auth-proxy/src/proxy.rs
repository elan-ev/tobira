use hyper::{Body, Client, Request, Response, StatusCode, Uri, http::uri};
use hyper_rustls::HttpsConnector;
use std::{convert::Infallible, fmt, net::IpAddr, str::FromStr, sync::Arc};

use crate::Args;



pub(crate) async fn handle(
    mut req: Request<Body>,
    args: Arc<Args>,
) -> Result<Response<Body>, Infallible> {
    // Build new URI and change the given request.
    let uri = {
        let mut parts = req.uri().clone().into_parts();
        parts.scheme = Some(args.target.scheme.clone());
        parts.authority = Some(args.target.authority.clone());
        Uri::from_parts(parts).expect("bug: invalid URI")
    };
    *req.uri_mut() = uri.clone();

    // Get headers from template user
    let template_headers = args.template.map(|t| t.headers())
        .into_iter()
        .flatten();

    // Add additional headers to the request
    for header in template_headers.chain(args.headers.clone()) {
        req.headers_mut().insert(header.name, header.value);
    }

    let client = Client::builder().build::<_, hyper::Body>(HttpsConnector::with_native_roots());
    let out = match client.request(req).await {
        Ok(response) => response,
        Err(e) => {
            let status = if e.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            let msg = format!(
                "Error: could not reach proxy target at {}. Is Tobira running?",
                args.target,
            );

            Response::builder()
                .status(status)
                .header("Content-Type", "text/plain")
                .body(msg.into())
                .unwrap()
        }
    };

    Ok(out)
}


/// Defintion of a proxy target consisting of a scheme and authority (≈host).
///
/// The `FromStr` allows omitting the scheme ('http' or 'https') if the host is
/// `"localhost"` or a loopback address and defaults to 'http' in that case. For
/// all other hosts, the scheme has to be specified.
#[derive(Clone, PartialEq, Eq)]
pub struct ProxyTarget {
    pub(crate) scheme: uri::Scheme,
    pub(crate) authority: uri::Authority,
}

impl From<(uri::Scheme, uri::Authority)> for ProxyTarget {
    fn from((scheme, authority): (uri::Scheme, uri::Authority)) -> Self {
        Self { scheme, authority }
    }
}

impl fmt::Display for ProxyTarget {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}://{}", self.scheme, self.authority)
    }
}

impl fmt::Debug for ProxyTarget {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}


impl FromStr for ProxyTarget {
    type Err = ProxyTargetParseError;
    fn from_str(src: &str) -> Result<Self, Self::Err> {
        let parts = src.parse::<Uri>()?.into_parts();
        let has_real_path = parts.path_and_query.as_ref()
            .map_or(false, |pq| !pq.as_str().is_empty() && pq.as_str() != "/");
        if has_real_path {
            return Err(ProxyTargetParseError::HasPath);
        }

        let authority = parts.authority.ok_or(ProxyTargetParseError::MissingAuthority)?;
        let scheme = parts.scheme
            .or_else(|| {
                // If the authority is a loopback IP or "localhost", we default to HTTP as scheme.
                let ip = authority.host().parse::<IpAddr>();
                if authority.host() == "localhost" || ip.map_or(false, |ip| ip.is_loopback()) {
                    Some(uri::Scheme::HTTP)
                } else {
                    None
                }
            })
            .ok_or(ProxyTargetParseError::MissingScheme)?;

        Ok(Self { scheme, authority })
    }
}

/// Error that can occur when parsing a `ProxyTarget` from a string.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum ProxyTargetParseError {
    /// The string could not be parsed as `http::Uri`.
    #[error("invalid URI: {0}")]
    InvalidUri(#[from] uri::InvalidUri),

    /// The parsed URL has a path, but a proxy target must not have a path.
    #[error("proxy target has path which is not allowed")]
    HasPath,

    /// The URI does not have a scheme ('http' or 'https') specified when it
    /// should have.
    #[error("proxy target has no scheme ('http' or 'https') specified, but a \
        scheme must be specified for non-local targets")]
    MissingScheme,

    /// The URI does not have an authority (≈ "host"), but it needs one.
    #[error("proxy target has no authority (\"host\") specified")]
    MissingAuthority,
}
