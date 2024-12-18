//! This module contains a bunch of small inline modules to make it possible to
//! easily filter out individual log messages with out filter system.


use hyper::{body::Incoming, Request};
use crate::prelude::*;

pub mod req {
    use super::*;

    pub fn log(req: &Request<Incoming>) {
        trace!(
            method = ?req.method(),
            path = req.uri().path_and_query().map_or("", |pq| pq.as_str()),
            "Incoming HTTP request",
        );
    }
}



pub mod headers {
    use super::*;

    pub fn log(req: &Request<Incoming>) {
        if tracing::enabled!(tracing::Level::TRACE) {
            let mut out = String::new();
            for (name, value) in req.headers() {
                use std::fmt::Write;
                write!(out, "\n  {}: {}", name, String::from_utf8_lossy(value.as_bytes())).unwrap();
            }
            trace!("HTTP Headers: {}", out);
        }
    }
}
