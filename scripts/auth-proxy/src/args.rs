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
    /// (e.g. `-H 'x-tobira-username: peter'`). Override headers set by the
    /// user template.
    #[structopt(short = "-H")]
    pub(crate) headers: Vec<Header>,

    /// A template for header values: 'admin', 'instructor' or 'student'.
    pub(crate) template: Option<UserTemplate>,
}

#[derive(Debug, Clone)]
pub(crate) struct Header {
    pub(crate) name: HeaderName,
    pub(crate) value: HeaderValue,
}

impl Header {
    /// Panics when invalid names/values are given.
    pub(crate) fn new(name: &str, value: &str) -> Self {
        Self {
            name: HeaderName::from_lowercase(name.to_lowercase().as_bytes())
                .expect("invalid header name"),
            value: HeaderValue::from_bytes(value.as_bytes()).expect("invalid header value"),
        }
    }
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

#[derive(Debug, Clone, Copy)]
pub(crate) enum UserTemplate {
    Admin,
    Instructor,
    Student,
}

impl FromStr for UserTemplate {
    type Err = &'static str;
    fn from_str(src: &str) -> Result<Self, Self::Err> {
        match src {
            "admin" => Ok(Self::Admin),
            "instructor" => Ok(Self::Instructor),
            "student" => Ok(Self::Student),
            _ => Err("unknown user template"),
        }
    }
}

impl UserTemplate {
    pub(crate) fn headers(&self) -> [Header; 3] {
        match &self {
            UserTemplate::Admin => [
                Header::new("x-tobira-username", "admin"),
                Header::new("x-tobira-user-display-name", "Administrator"),
                Header::new(
                    "x-tobira-user-roles",
                    "ROLE_ADMIN, ROLE_USER_ADMIN, ROLE_ANONYMOUS, ROLE_USER, ROLE_SUDO",
                ),
            ],
            UserTemplate::Instructor => [
                Header::new("x-tobira-username", "sabine"),
                Header::new("x-tobira-user-display-name", "Sabine Rudolfs"),
                Header::new(
                    "x-tobira-user-roles",
                    "ROLE_USER_SABINE, ROLE_ANONYMOUS, ROLE_USER, ROLE_INSTRUCTOR",
                ),
            ],
            UserTemplate::Student => [
                Header::new("x-tobira-username", "augustus"),
                Header::new("x-tobira-user-display-name", "Augustus Pagenkämper"),
                Header::new(
                    "x-tobira-user-roles",
                    "ROLE_USER_AUGUSTUS, ROLE_ANONYMOUS, ROLE_USER, ROLE_STUDENT",
                ),
            ],
        }
    }
}
