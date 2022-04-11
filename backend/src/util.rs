use std::{fmt, str::FromStr, net::{Ipv6Addr, Ipv4Addr}};
use hyper::http::uri;
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
