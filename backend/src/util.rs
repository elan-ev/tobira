use std::{fmt, str::FromStr, net::Ipv6Addr};
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
    /// Makes sure that the scheme is HTTPS or that the host resolves to a loopback address.
    pub(crate) fn assert_safety(&self) -> Result<()> {
        use std::net::ToSocketAddrs;

        if self.scheme == hyper::http::uri::Scheme::HTTP {
            let host = self.authority.host();

            let bracketed_ipv6 =
                (|| host.strip_prefix('[')?.strip_suffix(']')?.parse::<Ipv6Addr>().ok())();
            let is_loopback = match bracketed_ipv6 {
                Some(ipv6) => ipv6.is_loopback(),
                None => (host, 0u16).to_socket_addrs()
                    .context("failed to resolve host")?
                    .all(|sa| sa.ip().is_loopback()),
            };

            anyhow::ensure!(
                is_loopback,
                "Host '{self}' uses unsecure HTTP, but does not resolve to a loopback \
                    address. For security, this is not allowed.",
            );
        }

        Ok(())
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

        if !authority.as_str().starts_with(authority.host()) {
            bail!("userinfo not allowed in authority");
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


#[cfg(test)]
mod tests {
    use super::HttpHost;

    fn parse_http_host(s: &str) -> HttpHost {
        s.parse::<HttpHost>().expect(&format!("could not parse '{s}' as HttpHost"))
    }

    #[test]
    fn http_hosts_loopback() {
        let hosts = [
            "localhost",
            "localhost:1234",
            "127.0.0.1",
            "127.0.0.1:4321",
            "127.1.2.3",
            "127.1.2.3:4321",
            "[::1]",
            "[::1]:4321",
        ];

        for host in hosts {
            for scheme in ["http", "https"] {
                let http_host = parse_http_host(&format!("{scheme}://{host}"));
                if let Err(e) = http_host.assert_safety() {
                    panic!("Failed to validate {http_host}: {e}");
                }
            }
        }
    }

    #[test]
    fn http_hosts_non_loopback() {
        let hosts = [
            "1.1.1.1",
            "1.1.1.1:3456",
            "[2606:4700:4700::1111]",
            "[2606:4700:4700::1111]:3456",
            "github.com",
            "github.com:3456",
        ];

        for host in hosts {
            for scheme in ["http", "https"] {
                let http_host = parse_http_host(&format!("{scheme}://{host}"));

                if scheme == "http" {
                    if http_host.assert_safety().is_ok() {
                        panic!("HttpHost validated successfully, but shouldn't! {http_host}");
                    }
                } else {
                    if let Err(e) = http_host.assert_safety() {
                        panic!("Failed to validate {http_host}: {e}");
                    }
                }
            }
        }
    }
}
