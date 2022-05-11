use ring::{rand::{SecureRandom, SystemRandom}, signature::EcdsaKeyPair};
use serde::Serialize;
use serde_json::json;
use std::{path::PathBuf, time::Duration};

use crate::prelude::*;

use super::User;



#[derive(Debug, Clone, confique::Config)]
pub(crate) struct JwtConfig {
    /// Signing algorithm for JWTs. Prefer `ES` style algorithms over others.
    /// The algorithm choice has to be configured in Opencast as well.
    ///
    /// Valid values: TODO.
    signing_algorithm: Algorithm,

    /// Path to the secret signing key. The key has to be PEM encoded.
    ///
    /// # For `ES*` algorithms
    ///
    /// Has to be an EC key encoded as PKCS#8. To generate such a key, you can
    /// run these commands:
    ///
    ///     openssl ecparam -name secp256r1 -genkey -noout -out sec1.pem
    ///     openssl pkcs8 -topk8 -nocrypt -in sec1.pem -out private-key.pem
    ///
    /// Here, the `sec1.pem` is encoded as SEC1 instead of PKCS#8. The second
    /// command converts the key.
    pub(crate) secret_key: PathBuf,


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
}

impl Algorithm {
    fn to_str(&self) -> &'static str {
        match self {
            Algorithm::ES256 => "ES256",
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
    pub(crate) fn jwks(&self) -> &str {
        &self.auth.jwks
    }

    /// Creates a new JWT.
    pub(crate) fn new_upload_token(&self, user: &User) -> String {
        let exp = chrono::offset::Utc::now()
            + chrono::Duration::from_std(self.config.expiration_time)
                .expect("failed to convert from std Duration to chrono::Duration");

        let payload = json!({
            "name": user.display_name,
            "username": user.username,
            "exp": exp.timestamp(),
        });

        self.encode(&payload)
    }

    /// Encodes the given payload as JWT.
    fn encode(&self, payload: &impl Serialize) -> String {
        let header = json!({
            "typ": "JWT",
            "alg": self.config.signing_algorithm.to_str(),
        });

        let mut jwt = String::new();

        // Encode header and payload
        let header_json = serde_json::to_string(&header).expect("failed to serialize JWT header");
        let payload_json = serde_json::to_string(payload).expect("failed to serialize JWT payload");
        base64::encode_config_buf(&header_json, base64::URL_SAFE_NO_PAD, &mut jwt);
        jwt.push('.');
        base64::encode_config_buf(&payload_json, base64::URL_SAFE_NO_PAD, &mut jwt);

        // Sign and and append signature
        let mut signature = Vec::new();
        self.auth.signer.sign(&self.rng, jwt.as_bytes(), &mut signature);
        jwt.push('.');
        base64::encode_config_buf(&signature, base64::URL_SAFE_NO_PAD, &mut jwt);

        jwt
    }
}

impl JwtConfig {
    fn load_auth(&self) -> Result<JwtAuth> {
        let pem_encoded = std::fs::read(&self.secret_key)
            .context("could not load secret key file")?;
        let pem = pem::parse(pem_encoded)
            .context("secret key file is not a valid PEM encoded key")?;

        match self.signing_algorithm {
            algo @ Algorithm::ES256 => JwtAuth::load_es(algo, &pem.contents),
        }
    }
}



struct JwtAuth {
    signer: Box<dyn Signer>,
    jwks: String,
}

impl JwtAuth {
    /// Loads an elliptic curve key. `algo` has to be `ES256`!
    fn load_es(algo: Algorithm, key: &[u8]) -> Result<JwtAuth> {
        use elliptic_curve::pkcs8::DecodePrivateKey;

        // Create a `ring` key pair that is used for signing.
        let ring_algo = match algo {
            Algorithm::ES256 => &ring::signature::ECDSA_P256_SHA256_FIXED_SIGNING,
            // Algorithm::ES384 => &ring::signature::ECDSA_P384_SHA384_FIXED_SIGNING,
        };
        let ring_key = EcdsaKeyPair::from_pkcs8(ring_algo, key).map_err(|e| {
            anyhow!("`jwt.secret_key` is not a valid ECDSA keypair in PKCS8 format: {}", e)
        })?;

        // Create the JWK(S) from the given key for the public route.
        let jwk = match algo {
            Algorithm::ES256 => <elliptic_curve::SecretKey<p256::NistP256>>::from_pkcs8_der(key)
                .expect("failed to read ECDSA keypair, but it worked with `ring`?!")
                .public_key()
                .to_jwk(),
        };


        Ok(Self {
            signer: Box::new(ring_key),
            jwks: jwk_to_jwks(algo, jwk),
        })
    }
}

/// Serializes the given `jwk` from `elliptic_curve` into the expected JWKS structure.
fn jwk_to_jwks(algo: Algorithm, jwk: impl Serialize) -> String {
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
    serde_json::to_string(&jwks).expect("failed to serialize JWKS")
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
