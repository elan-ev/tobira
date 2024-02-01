use std::fmt;
use hyper::client::HttpConnector;
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use rand::{RngCore, CryptoRng};
use secrecy::Secret;

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

/// This just adds a stable version of `Result::inspect` and `Option::inspect`.
/// This can be removed once the std methods were stabilized.
pub(crate) trait InspectExt<T> {
    fn inspect_(self, f: impl FnOnce(&T)) -> Self;
}

impl<T> InspectExt<T> for Option<T> {
    fn inspect_(self, f: impl FnOnce(&T)) -> Self {
        self.map(|t| {
            f(&t);
            t
        })
    }
}

impl<T, E> InspectExt<T> for Result<T, E> {
    fn inspect_(self, f: impl FnOnce(&T)) -> Self {
        self.map(|t| {
            f(&t);
            t
        })
    }
}
