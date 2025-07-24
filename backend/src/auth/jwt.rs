use bytes::Bytes;
use aws_lc_rs::{rand::{SecureRandom, SystemRandom}, signature::{self, EcdsaKeyPair}};
use serde::Serialize;
use serde_json::json;
use std::{path::PathBuf, time::Duration};

use crate::prelude::*;

use super::User;



#[derive(Debug, Clone, confique::Config)]
pub(crate) struct JwtConfig {
    /// Signing algorithm for JWTs.
    ///
    /// Valid values: "ES256", "ES384"
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
}

impl Algorithm {
    fn to_str(&self) -> &'static str {
        match self {
            Algorithm::ES256 => "ES256",
            Algorithm::ES384 => "ES384",
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
        let auth = config.load_auth().context("failed to load `jwt.secret_key`")?;

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
            "alg": self.config.signing_algorithm.to_str(),
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

impl JwtConfig {
    fn load_auth(&self) -> Result<JwtAuth> {
        let rng = SystemRandom::new();
        if let Some(secret_key_path) = &self.secret_key {
            let pem_encoded = std::fs::read(secret_key_path)
                .context("could not load secret key file")?;
            let (_label, pkcs8_bytes) = pem_rfc7468::decode_vec(&pem_encoded)
                .context("secret key file is not a valid PEM encoded key")?;
            JwtAuth::load_es(self.signing_algorithm, &pkcs8_bytes)
        } else {
            let ring_algo = match self.signing_algorithm {
                Algorithm::ES256 => &signature::ECDSA_P256_SHA256_FIXED_SIGNING,
                Algorithm::ES384 => &signature::ECDSA_P384_SHA384_FIXED_SIGNING,
            };

            info!(
                "No JWT key specified, generating key for algorithm {}",
                self.signing_algorithm.to_str(),
            );
            let pkcs8_bytes = EcdsaKeyPair::generate_pkcs8(ring_algo, &rng)
                .map_err(|_| anyhow!("failed to generate JWT ECDSA key"))?;

            JwtAuth::load_es(self.signing_algorithm, pkcs8_bytes.as_ref())
        }
    }
}



struct JwtAuth {
    signer: Box<dyn Signer>,
    jwks: Bytes,
}

impl JwtAuth {
    /// Loads an elliptic curve key. `algo` has to be `ES256` or `ES384`!
    fn load_es(algo: Algorithm, key: &[u8]) -> Result<JwtAuth> {
        use elliptic_curve::pkcs8::DecodePrivateKey;

        // Create a `ring` key pair that is used for signing.
        let ring_algo = match algo {
            Algorithm::ES256 => &signature::ECDSA_P256_SHA256_FIXED_SIGNING,
            Algorithm::ES384 => &signature::ECDSA_P384_SHA384_FIXED_SIGNING,
        };
        let ring_key = EcdsaKeyPair::from_pkcs8(ring_algo, key).map_err(|e| {
            anyhow!("`jwt.secret_key` is not a valid ECDSA keypair for the expected \
                algorithm in PKCS8 format: {e}")
        })?;

        // Create the JWK(S) from the given key for the public route.
        macro_rules! get_jwk {
            ($curve:path) => {
                <elliptic_curve::SecretKey<$curve>>::from_pkcs8_der(key)
                    .expect("failed to read ECDSA keypair, but it worked with `ring`?!")
                    .public_key()
                    .to_jwk()
            }
        }

        let jwk = match algo {
            Algorithm::ES256 => get_jwk!(p256::NistP256),
            Algorithm::ES384 => get_jwk!(p384::NistP384),
        };


        Ok(Self {
            signer: Box::new(ring_key),
            jwks: jwk_to_jwks(algo, jwk),
        })
    }
}

/// Serializes the given `jwk` from `elliptic_curve` into the expected JWKS structure.
fn jwk_to_jwks(algo: Algorithm, jwk: impl Serialize) -> Bytes {
    #[derive(Serialize)]
    struct Jwk<T: Serialize> {
        #[serde(flatten)]
        inner: T,

        r#use: &'static str,
        alg: &'static str,
    }

    #[derive(Serialize)]
    struct Jwks<T: Serialize> {
        keys: [Jwk<T>; 1],
    }

    let jwks = Jwks {
        keys: [Jwk {
            inner: jwk,
            r#use: "sig",
            alg: algo.to_str(),
        }]
    };
    serde_json::to_string(&jwks).expect("failed to serialize JWKS").into()
}

/// A signature algorithm with corresponding key. Can sign a message.
trait Signer: Sync + Send {
    /// Signs the given message and writes the signature into `signature`.
    fn sign(&self, rng: &dyn SecureRandom, message: &[u8], signature: &mut Vec<u8>);
}

impl Signer for EcdsaKeyPair {
    fn sign(&self, rng: &dyn SecureRandom, message: &[u8], signature: &mut Vec<u8>) {
        let sig = self.sign(rng, message).expect("failed to sign JWT");
        signature.extend_from_slice(sig.as_ref())
    }
}
