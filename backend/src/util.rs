use bytes::Bytes;
use http_body_util::BodyExt;
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use hyperlocal::UnixConnector;
use rand::{RngCore, CryptoRng};
use secrecy::Secret;

use crate::{http::Response, prelude::*};


/// The URL-safe base64 alphabet.
pub(crate) const BASE64_DIGITS: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

pub(crate) fn base64_decode(ascii: u8) -> Option<u8> {
    /// The reverse lookup table to `BASE64_DIGITS`. If you index by an ASCII value, you
    /// either get the corresponding digit value OR `0xFF`, signalling that the
    /// character is not a valid base64 character.
    const DECODE_TABLE: [u8; 256] = create_decode_table();

    const fn create_decode_table() -> [u8; 256] {
        let mut out = [0xFF; 256];

        // If you wonder why we are using `while` instead of a more idiomatic loop:
        // const fns are still somewhat limited and do not allow `for`.
        let mut i = 0;
        while i < BASE64_DIGITS.len() {
            out[BASE64_DIGITS[i] as usize] = i as u8;
            i += 1;
        }

        out
    }
    let raw = DECODE_TABLE[ascii as usize];
    if raw == 0xFF {
        return None;
    }

    Some(raw)
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

pub(crate) type HttpsClient<B> = Client<HttpsConnector<HttpConnector>, B>;
pub(crate) type UdxHttpClient<B> = Client<UnixConnector, B>;

/// Returns an HTTP client that can also speak HTTPS. HTTPS is _not_ enforced!
pub(crate) fn http_client<B>() -> Result<HttpsClient<B>>
where
    B: hyper::body::Body + Send,
    B::Data: Send,
{
    let https = HttpsConnectorBuilder::new()
        .with_native_roots()
        .context("failed to load native certificate roots")?
        .https_or_http()
        .enable_http1()
        .enable_http2()
        .build();
    Ok(Client::builder(hyper_util::rt::TokioExecutor::new()).build(https))
}

pub(crate) type ByteBody = http_body_util::Full<Bytes>;

pub(crate) trait FullBodyExt {
    fn empty() -> Self;
}

impl FullBodyExt for ByteBody {
    fn empty() -> Self {
        Self::new(Bytes::new())
    }
}

pub(crate) trait ResponseExt {
    fn builder() -> hyper::http::response::Builder;
}

impl ResponseExt for Response {
    fn builder() -> hyper::http::response::Builder {
        hyper::Response::builder()
    }
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

pub(crate) async fn download_body<B>(body: B) -> Result<Bytes>
where
    B: hyper::body::Body,
    B::Error: 'static + Send + Sync + std::error::Error,
{
    // TODO: this should somehow limit the size in order to prevent DOS attacks
    // https://github.com/elan-ev/tobira/issues/667
    body.collect().await
        .context("failed to download HTTP body")?
        .to_bytes()
        .pipe(Ok)
}
