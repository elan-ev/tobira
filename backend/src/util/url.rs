//! URL Wrappers with specific checked properties.

use std::{fmt, net::{Ipv4Addr, Ipv6Addr}, ops, str::FromStr};

use hyper::Uri;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::prelude::*;


/// A HTTP(S) URL with a host, without user/password.
///
/// Intended to be the lowest common denominator for all kinds of URLs.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub struct HttpUrl(Url);

impl HttpUrl {
    pub fn parse(src: &str) -> Result<Self> {
        src.parse()
    }

    pub fn to_uri(&self) -> Uri {
        self.as_str().parse().expect("`HttpUrl` not parsable as `Uri`")
    }

    pub fn with_path(mut self, path: &str) -> Self {
        self.0.set_path(path);
        self
    }

    /// Returns `true` if this URL has a non-empty, non `/` path.
    pub fn has_real_path(&self) -> bool {
        !self.path().is_empty() && self.path() != "/"
    }

    pub fn has_query(&self) -> bool {
        self.query().is_some()
    }

    pub fn has_fragment(&self) -> bool {
        self.fragment().is_some()
    }

    pub fn ensure_no_path(&self) -> Result<()> {
        anyhow::ensure!(!self.has_real_path(), "URL must not have a path");
        Ok(())
    }

    pub fn ensure_no_query(&self) -> Result<()> {
        anyhow::ensure!(!self.has_query(), "URL must not have a query component");
        Ok(())
    }

    pub fn ensure_no_fragment(&self) -> Result<()> {
        anyhow::ensure!(!self.has_fragment(), "URL must not have a fragment part");
        Ok(())
    }

    /// Makes sure the URL is using `httpS`, is local or has a special tag in
    /// its fragment. Other fragments are disallowed.
    pub fn ensure_secure_no_fragment(&self) -> Result<()> {
        pub const SAFE_WORD: &str = "allow-insecure";

        match self.scheme() {
            "https" => {
                anyhow::ensure!(self.fragment().is_none(), "URL must not have a fragment part");
            }
            "http" => {
                let is_local = {
                    let host = self.host_str().expect("no host"); // Checked in `TryFrom`
                    let bracketed_ipv6 =
                        (|| host.strip_prefix('[')?.strip_suffix(']')?.parse::<Ipv6Addr>().ok())();


                    if let Some(ipv6) = bracketed_ipv6 {
                        ipv6.is_loopback()
                    } else if let Ok(ipv4) = host.parse::<Ipv4Addr>() {
                        ipv4.is_loopback()
                    } else {
                        // Sure, "localhost" could resolve to anything. But this check
                        // is for catching human errors, not for defending against
                        // attackers, so nothing here needs to be bulletproof.
                        host == "localhost"
                    }
                };

                if !(is_local || self.fragment() == Some(SAFE_WORD)) {
                    let url = &self.0;
                    bail!("Potentially dangerous URL with non-local host and 'http' scheme. \
                        If you really want to use unencrypted HTTP for non-local hosts, \
                        confirm by specifing the host as '{url}#{SAFE_WORD}'");
                }

                anyhow::ensure!(self.fragment().is_none_or(|f| f == SAFE_WORD),
                    "URL must not have a fragment part, except for optionally '{SAFE_WORD}'");
            }
            _ => unreachable!(), // Checked in `TryFrom`
        }

        Ok(())
    }
}

impl FromStr for HttpUrl {
    type Err = anyhow::Error;

    fn from_str(src: &str) -> std::result::Result<Self, Self::Err> {
        let url: Url = src.parse().context("invalid URL")?;
        url.try_into()
    }
}

impl TryFrom<Url> for HttpUrl {
    type Error = anyhow::Error;

    fn try_from(url: Url) -> Result<Self, Self::Error> {
        anyhow::ensure!(url.username().is_empty(), "URL must not contain username part");
        anyhow::ensure!(url.password().is_none(), "URL must not contain password part");
        anyhow::ensure!(["http", "https"]. contains(&url.scheme()),
            "URL scheme must be 'http' or 'https'");
        anyhow::ensure!(url.has_host(), "URL must contain a host");

        Ok(Self(url))
    }
}

impl TryFrom<Uri> for HttpUrl {
    type Error = anyhow::Error;

    fn try_from(uri: Uri) -> Result<Self, Self::Error> {
        Url::parse(&uri.to_string())?.try_into()
    }
}

impl ops::Deref for HttpUrl {
    type Target = Url;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for HttpUrl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl TryFrom<String> for HttpUrl {
    type Error = anyhow::Error;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl Into<String> for HttpUrl {
    fn into(self) -> String {
        self.to_string()
    }
}


/// An URL with only scheme + host, which is checked to be secure (httpS).
#[derive(Clone, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub struct HttpHost {
    pub scheme: hyper::http::uri::Scheme,
    pub authority: hyper::http::uri::Authority,
}

impl HttpHost {
    /// Returns a full URI by combining `self` with the given path+query. Panics
    /// if `pq` is malformed!
    pub fn with_path_and_query(self, pq: &str) -> Uri {
        Uri::builder()
            .scheme(self.scheme)
            .authority(self.authority)
            .path_and_query(pq)
            .build()
            .expect("invalid URI path+query")
    }

    pub fn url_with_path(self, path: &str) -> HttpUrl {
        self.with_path_and_query(path).try_into().unwrap()
    }
}

impl fmt::Display for HttpHost {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}://{}", self.scheme, self.authority)
    }
}

impl fmt::Debug for HttpHost {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl From<HttpHost> for String {
    fn from(value: HttpHost) -> Self {
        value.to_string()
    }
}

impl FromStr for HttpHost {
    type Err = anyhow::Error;
    fn from_str(src: &str) -> Result<Self, Self::Err> {
        let url = HttpUrl::parse(src)?;
        url.ensure_no_path()?;
        url.ensure_no_query()?;
        url.ensure_secure_no_fragment()?;

        let parts = url.to_uri().into_parts();
        let authority = parts.authority.unwrap();
        let scheme = parts.scheme.unwrap();

        Ok(Self { scheme, authority })
    }
}

impl TryFrom<String> for HttpHost {
    type Error = <Self as FromStr>::Err;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}


#[cfg(test)]
mod tests {
    use super::HttpHost;

    fn parse_http_host(s: &str) -> HttpHost {
        s.parse::<HttpHost>().expect(&format!("could not parse '{s}' as HttpHost"))
    }

    const LOCAL_HOSTS: &[&str] = &[
        "localhost",
        "localhost:1234",
        "127.0.0.1",
        "127.0.0.1:4321",
        "127.1.2.3",
        "127.1.2.3:4321",
        "[::1]",
        "[::1]:4321",
    ];

    const NON_LOCAL_HOSTS: &[&str] = &[
        "1.1.1.1",
        "1.1.1.1:3456",
        "[2606:4700:4700::1111]",
        "[2606:4700:4700::1111]:3456",
        "github.com",
        "github.com:3456",
    ];

    #[test]
    fn http_host_parse_https() {
        for host in LOCAL_HOSTS.iter().chain(NON_LOCAL_HOSTS) {
            parse_http_host(&format!("https://{host}"));
        }
    }

    #[test]
    fn http_host_parse_http_local() {
        for host in LOCAL_HOSTS {
            parse_http_host(&format!("http://{host}"));
        }
    }

    #[test]
    fn http_host_parse_http_non_local_safeword() {
        for host in NON_LOCAL_HOSTS {
            parse_http_host(&format!("http://{host}#allow-insecure"));
        }
    }

    #[test]
    fn http_host_parse_http_non_local_error() {
        for host in NON_LOCAL_HOSTS {
            format!("http://{host}").parse::<HttpHost>().unwrap_err();
        }
    }
}
