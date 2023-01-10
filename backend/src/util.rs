use std::{fmt, str::FromStr, net::{Ipv6Addr, Ipv4Addr}};
use hyper::{http::uri, client::HttpConnector, Uri};
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use rand::{RngCore, CryptoRng};
use secrecy::Secret;
use serde::Deserialize;

use crate::prelude::*;


/// A lazy `fmt` formatter, specified by a callable. Usually created via
/// `lazy_format!`.
///
/// This is particularly useful in situations where you want a method to return
/// a formatted value, but don't want to return an allocated `String`. For
/// example, if the returned value is formatted into yet another value anyway,
/// allocating a string is useless. Instead of returning `String`, you then
/// return `impl fmt::Display + '_`.
pub(crate) struct LazyFormat<F: Fn(&mut fmt::Formatter) -> fmt::Result>(pub F);

impl<F> fmt::Display for LazyFormat<F>
where
    F: Fn(&mut fmt::Formatter) -> fmt::Result,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        (self.0)(f)
    }
}

macro_rules! lazy_format {
    ($fmt:literal $($t:tt)*) => {
        crate::util::LazyFormat(move |f| write!(f, $fmt $($t)*))
    };
}

pub(crate) use lazy_format;


#[derive(Clone, Deserialize)]
#[serde(try_from = "String")]
pub(crate) struct HttpHost {
    pub(crate) scheme: hyper::http::uri::Scheme,
    pub(crate) authority: hyper::http::uri::Authority,
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

impl FromStr for HttpHost {
    type Err = anyhow::Error;
    fn from_str(src: &str) -> Result<Self, Self::Err> {
        let parts = src.parse::<hyper::http::uri::Uri>()?.into_parts();
        let has_real_path = parts.path_and_query.as_ref()
            .map_or(false, |pq| !pq.as_str().is_empty() && pq.as_str() != "/");
        if has_real_path {
            bail!("invalid HTTP host: must not contain a path");
        }

        let authority = parts.authority
            .ok_or(anyhow!("invalid HTTP host: contains no authority part"))?;
        let scheme = parts.scheme
            .ok_or(anyhow!("invalid HTTP host: has to specify 'http' or 'https'"))?;

        if scheme != uri::Scheme::HTTP && scheme != uri::Scheme::HTTPS {
            bail!("scheme has to be 'http' or 'https'");
        }

        if !authority.as_str().starts_with(authority.host()) {
            bail!("userinfo not allowed in authority");
        }

        // Next, we check for HTTP safety. For local hosts, we allow HTTP, but
        // for others, we require a special "safe word" at the end. This is
        // just to avoid human errors.
        let host = authority.host();
        let is_local = {
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

        const SAFE_WORD: &str = "#allow-insecure";
        if scheme == uri::Scheme::HTTP && !(is_local || src.ends_with(SAFE_WORD)) {
            bail!("if you really want to use unencrypted HTTP for non-local hosts, \
                confirm by specifing the host as 'http://{host}{SAFE_WORD}'");
        }

        Ok(Self { scheme, authority })
    }
}

impl TryFrom<String> for HttpHost {
    type Error = <Self as FromStr>::Err;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

/// An empty `enum` for signaling the fact that a function (potentially) never returns.
/// Note that you can't construct a value of this type, so a function returning it
/// can never return. A function returning `Result<NeverReturns>` never returns
/// when it succeeds, but it might still fail.
pub(crate) enum Never {}

/// Generate random bytes with a crypotgraphically secure RNG.
pub(crate) fn gen_random_bytes_crypto<const N: usize>() -> Secret<[u8; N]> {
    // We use this extra function here to make sure we use a
    // cryptographically secure RNG, even after updating to newer `rand`
    // versions. Right now, we use `thread_rng` and it is cryptographically
    // secure. But if the `rand` authors make `thread_rng` return a
    // non-cryptographically secure RNG in future major version (a dangerous
    // API decision in my opinion) and if the Tobira dev updating the
    // library does not check the changelog, then we would have a problem.
    // This explicit `CryptoRng` bound makes sure that such a change would
    // not silently compile.
    fn imp<const N: usize>(mut rng: impl RngCore + CryptoRng) -> [u8; N] {
        let mut bytes = [0; N];
        rng.fill_bytes(&mut bytes);
        bytes
    }

    Secret::new(imp(rand::thread_rng()))
}

/// Returns an HTTP client that can also speak HTTPS. HTTPS is _not_ enforced!
pub(crate) fn http_client() -> hyper::Client<HttpsConnector<HttpConnector>, hyper::Body> {
    let https = HttpsConnectorBuilder::new()
        .with_native_roots()
        .https_or_http()
        .enable_http1()
        .enable_http2()
        .build();
    hyper::Client::builder().build(https)
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
