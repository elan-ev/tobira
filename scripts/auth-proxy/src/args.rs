use hyper::header::{HeaderName, HeaderValue};
use std::str::FromStr;
use structopt::StructOpt;

use crate::ProxyTarget;


#[derive(Debug, StructOpt)]
#[structopt(about = "Dummy auth proxy for testing Tobira")]
pub(crate) struct Args {
    /// Proxy target (where requests are forwarded to).
    #[structopt(short, long, default_value = "localhost:3080")]
    pub(crate) target: ProxyTarget,

    /// Port to listen on.
    #[structopt(short, long, default_value = "3081")]
    pub(crate) port: u16,

    /// Header(s) to set when forwarding the request to the proxy target
    /// (e.g. `-H 'x-tobira-username: peter'`).
    #[structopt(short = "-H")]
    pub(crate) headers: Vec<Header>,
}

#[derive(Debug)]
pub(crate) struct Header {
    pub(crate) name: HeaderName,
    pub(crate) value: HeaderValue,
}

impl FromStr for Header {
    type Err = String;
    fn from_str(src: &str) -> Result<Self, Self::Err> {
        let (l, r) = src.split_once(':')
            .ok_or_else(|| "invalid header value: missing colon".to_string())?;
        let name = HeaderName::from_lowercase(l.trim().to_lowercase().as_bytes())
            .map_err(|e| format!("invalid header name: {}", e))?;
        let value = HeaderValue::from_bytes(r.trim().as_bytes())
            .map_err(|e| format!("invalid header value: {}", e))?;

        Ok(Self { name, value })
    }
}
