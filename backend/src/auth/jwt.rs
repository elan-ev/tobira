use base64::{prelude::BASE64_URL_SAFE_NO_PAD, Engine};
use bytes::Bytes;
use aws_lc_rs::{rand::{SecureRandom, SystemRandom}, signature::{self, EcdsaKeyPair, Ed25519KeyPair, KeyPair}};
use serde::Serialize;
use serde_json::json;
use std::{path::PathBuf, time::Duration};

use crate::prelude::*;

use super::User;



#[derive(Debug, Clone, confique::Config)]
pub(crate) struct JwtConfig {
    /// Signing algorithm for JWTs.
    ///
    /// Valid values: "ES256", "ES384", "ED25519"
    #[config(default = "ES384")]
    signing_algorithm: Algorithm,

    /// Path to the secret signing key. The key has to be PEM encoded. If not
    /// specified, a key is generated everytime Tobira is started. The randomly
    /// generated key is fine for most use cases.
    pub(crate) secret_key: Option<PathBuf>,

    /// The duration for which a JWT is valid. JWTs are just used as temporary
    /// ways to authenticate against Opencast, so they just have to be valid
    /// until the frontend received the JWT and used it with Opencast.
    #[config(default = "30s", deserialize_with = crate::config::deserialize_duration)]
    pub(crate) expiration_time: Duration,
}

/// A supported JWT signing algorithm.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub(crate) enum Algorithm {
    ES256,
    ES384,
    ED25519,
}

impl Algorithm {
    /// Returns the value for the `alg` field in a JWT header.
    fn jwt_alg_field(&self) -> &'static str {
        match self {
            Algorithm::ES256 => "ES256",
            Algorithm::ES384 => "ES384",
            Algorithm::ED25519 => "EdDSA",
        }
    }
}

/// Context for JWT operations that persists for runtime of Tobira.
pub(crate) struct JwtContext {
    rng: SystemRandom,
    auth: JwtAuth,
    config: JwtConfig,
}

impl JwtContext {
    pub(crate) fn new(config: &JwtConfig) -> Result<Self> {
        let auth = JwtAuth::load(config).context("failed to load `jwt.secret_key`")?;

        Ok(Self {
            rng: SystemRandom::new(),
            auth,
            config: config.clone(),
        })
    }

    /// Returns the JWKS as string. This is served as public JSON document.
    pub(crate) fn jwks(&self) -> &Bytes {
        &self.auth.jwks
    }

    /// Creates a new JWT.
    pub(crate) fn new_token(&self, user: Option<&User>, auth_claims: impl Serialize) -> String {
        #[derive(Serialize)]
        struct UserInfo<'a> {
            sub: &'a str,
            // TODO: this is just for backwards compatibility and should be
            // removed in the future.
            username: &'a str,
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            email: Option<&'a str>,
        }

        #[derive(Serialize)]
        struct Payload<'a, A: Serialize> {
            exp: i64,
            #[serde(flatten, skip_serializing_if = "Option::is_none")]
            user: Option<UserInfo<'a>>,
            #[serde(flatten)]
            auth_claims: A,
        }

        let exp = chrono::offset::Utc::now()
            + chrono::Duration::from_std(self.config.expiration_time)
                .expect("failed to convert from std Duration to chrono::Duration");

        let payload = Payload {
            exp: exp.timestamp(),
            user: user.map(|user| UserInfo {
                sub: &user.username,
                username: &user.username,
                name: &user.display_name,
                email: user.email.as_deref(),
            }),
            auth_claims,
        };

        self.encode(&payload)
    }

    /// Encodes the given payload as JWT.
    fn encode(&self, payload: &impl Serialize) -> String {
        let header = json!({
            "typ": "JWT",
            "alg": self.config.signing_algorithm.jwt_alg_field(),
        });

        let mut jwt = String::new();

        let encode = |data: &[u8], buf: &mut String| {
            use base64::Engine;
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode_string(data, buf);
        };

        // Encode header and payload
        let header_json = serde_json::to_string(&header).expect("failed to serialize JWT header");
        let payload_json = serde_json::to_string(payload).expect("failed to serialize JWT payload");
        encode(header_json.as_bytes(), &mut jwt);
        jwt.push('.');
        encode(payload_json.as_bytes(), &mut jwt);

        // Sign and and append signature
        let mut signature = Vec::new();
        self.auth.signer.sign(&self.rng, jwt.as_bytes(), &mut signature);
        jwt.push('.');
        encode(&signature, &mut jwt);

        jwt
    }
}

struct JwtAuth {
    signer: Box<dyn Signer>,
    jwks: Bytes,
}

impl JwtAuth {
    fn load(config: &JwtConfig) -> Result<Self> {
        let ec_algo = || match config.signing_algorithm {
            Algorithm::ES256 => &signature::ECDSA_P256_SHA256_FIXED_SIGNING,
            Algorithm::ES384 => &signature::ECDSA_P384_SHA384_FIXED_SIGNING,
            Algorithm::ED25519 => unreachable!(),
        };

        let signer = if let Some(secret_key_path) = &config.secret_key {
            let pem_encoded = std::fs::read(secret_key_path)
                .context("could not load secret key file")?;
            let (_label, pkcs8_bytes) = pem_rfc7468::decode_vec(&pem_encoded)
                .context("secret key file is not a valid PEM encoded key")?;

            let signer = match config.signing_algorithm {
                Algorithm::ES256 | Algorithm::ES384 => {
                    let key = EcdsaKeyPair::from_pkcs8(ec_algo(), &pkcs8_bytes)
                        .context("`jwt.secret_key` is not a valid PKCS8 ECDSA keypair \
                            for the configured algorithm")?;
                    Box::new(key) as Box<dyn Signer>
                }
                Algorithm::ED25519 => {
                    let key = Ed25519KeyPair::from_pkcs8(&pkcs8_bytes)
                        .context("`jwt.secret_key` is not a valid PKCS8 ED25519 keypair")?;
                    Box::new(key) as Box<dyn Signer>
                }
            };

            info!("Loaded JWT secret key");
            signer
        } else {
            info!(
                "No JWT key specified, generating key for algorithm {:?}",
                config.signing_algorithm,
            );

            match config.signing_algorithm {
                Algorithm::ES256 | Algorithm::ES384 => {
                    let key = EcdsaKeyPair::generate(ec_algo())
                        .context("failed to generate JWT ECDSA key")?;
                    Box::new(key) as Box<dyn Signer>
                }
                Algorithm::ED25519 => {
                    let key = Ed25519KeyPair::generate()
                        .context("failed to generate JWT ED25519 key")?;
                    Box::new(key) as Box<dyn Signer>
                }
            }
        };

        let jwk = signer.jwk();
        Ok(Self {
            signer,
            jwks: jwk_to_jwks(config.signing_algorithm, jwk),
        })
    }
}

/// Serializes the given `jwk` from `elliptic_curve` into the expected JWKS structure.
fn jwk_to_jwks(algo: Algorithm, jwk: JwkCore) -> Bytes {
    #[derive(Serialize)]
    struct Jwk {
        #[serde(flatten)]
        inner: JwkCore,

        r#use: &'static str,
        alg: &'static str,
    }

    let jwk = Jwk {
        inner: jwk,
        r#use: "sig",
        alg: algo.jwt_alg_field(),
    };
    let jwks = serde_json::json!({
        "keys": [jwk],
    });
    serde_json::to_string(&jwks).expect("failed to serialize JWKS").into()
}

#[derive(Serialize)]
struct JwkCore {
    kty: &'static str,
    crv: &'static str,
    x: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    y: Option<String>
}

/// A signature algorithm with corresponding key. Can sign a message.
trait Signer: Sync + Send {
    /// Signs the given message and writes the signature into `signature`.
    fn sign(&self, rng: &dyn SecureRandom, message: &[u8], signature: &mut Vec<u8>);

    /// Returns the JWK description of the public key.
    fn jwk(&self) -> JwkCore;
}


impl Signer for EcdsaKeyPair {
    fn sign(&self, rng: &dyn SecureRandom, message: &[u8], signature: &mut Vec<u8>) {
        let sig = self.sign(rng, message).expect("failed to sign JWT");
        signature.extend_from_slice(sig.as_ref())
    }

    fn jwk(&self) -> JwkCore {
        let public_key = self.public_key().as_ref();
        macro_rules! jwk {
            ($curve:path, $crv:literal) => {{

                let point = <elliptic_curve::sec1::EncodedPoint<$curve>>::from_bytes(public_key)
                    .expect("failed to read ECDSA keypair, but it worked with `ring`?!");
                JwkCore {
                    kty: "EC",
                    crv: $crv,
                    x: BASE64_URL_SAFE_NO_PAD.encode(point.x().expect("identity point")),
                    y: Some(BASE64_URL_SAFE_NO_PAD.encode(point.y().expect("identity point"))),
                }
            }}
        }

        if self.algorithm() == &signature::ECDSA_P256_SHA256_FIXED_SIGNING {
            jwk!(p256::NistP256, "P-256")
        } else if self.algorithm() == &signature::ECDSA_P384_SHA384_FIXED_SIGNING {
            jwk!(p384::NistP384, "P-384")
        } else {
            unreachable!()
        }
    }
}

impl Signer for Ed25519KeyPair {
    fn sign(&self, _: &dyn SecureRandom, message: &[u8], signature: &mut Vec<u8>) {
        let sig = self.sign(message);
        signature.extend_from_slice(sig.as_ref())
    }

    fn jwk(&self) -> JwkCore {
        let x = BASE64_URL_SAFE_NO_PAD.encode(self.public_key().as_ref());

        JwkCore {
            kty: "OKP",
            crv: "Ed25519",
            x,
            y: None,
        }
    }
}
