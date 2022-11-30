//! Database related things.

use deadpool_postgres::{Config as PoolConfig, Pool, Runtime};
use secrecy::{ExposeSecret, Secret};
use rustls::{
    Error,
    client::{ServerCertVerifier, ServerCertVerified, HandshakeSignatureValid},
    internal::msgs::handshake::DigitallySignedStruct,
};
use std::{
    fs,
    path::{PathBuf, Path},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio_postgres::NoTls;

use crate::{http::{self, Response}, prelude::*};


pub(crate) mod cmd;
mod migrations;
mod query;
mod tx;
pub(crate) mod types;
pub(crate) mod util;

pub(crate) use self::{
    tx::Transaction,
    migrations::{migrate, MigrationPlan},
};


#[derive(Debug, confique::Config, Clone)]
pub(crate) struct DbConfig {
    /// The username of the database user.
    #[config(default = "tobira")]
    user: String,

    /// The password of the database user.
    password: Secret<String>,

    /// The host the database server is running on.
    #[config(default = "127.0.0.1")]
    host: String,

    /// The port the database server is listening on. (Just useful if your
    /// database server is not running on the default PostgreSQL port).
    #[config(default = 5432)]
    port: u16,

    /// The name of the database to use.
    #[config(default = "tobira")]
    database: String,

    /// The TLS mode for the database connection.
    ///
    /// - "on": encryption is required and the server certificate is validated
    ///    against trusted certificates which are loaded from the system's
    ///    native certificate store. If `server_cert` is set, that's also
    ///    loaded and trusted.
    /// - "without-verify-cert": encryption is required, but the server
    ///   certificate is not checked. Allows MITM attacks! Discouraged.
    /// - "off": no encryption. Discouraged even more.
    #[config(default = "on")]
    tls_mode: TlsMode,

    /// Path to the server certificate. This makes sense if you don't want to
    /// install the certificate globally on the system. Has to be a PEM encoded
    /// file containing one or more X509 certificates.
    server_cert: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum TlsMode {
    Off,
    On,
    WithoutVerifyCert,
}

impl DbConfig {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.server_cert.is_some() && self.tls_mode != TlsMode::On {
            bail!(r#"`db.server_cert` is set, but TLS mode is NOT "on", which makes no sense"#);
        }

        Ok(())
    }

    /// Checks that the server certificate file, if given, exists and is valid.
    /// Basically only for the `check` subcommand.
    pub(crate) fn check_server_cert(&self) -> Result<()> {
        if let Some(path) = &self.server_cert {
            let mut root_certs = rustls::RootCertStore::empty();
            load_pem_file(path, &mut root_certs)
                .with_context(|| format!("failed to load '{}'", path.display()))?;
        }
        Ok(())
    }
}

/// Convenience type alias. Every function that needs to operate on the database
/// can just accept a `db: &Db` parameter.
pub(crate) type Db = deadpool_postgres::ClientWrapper;

/// Type alias for an owned DB connection.
pub(crate) type DbConnection = deadpool::managed::Object<deadpool_postgres::Manager>;


/// Creates a new database connection pool.
pub(crate) async fn create_pool(config: &DbConfig) -> Result<Pool> {
    let pool_config = PoolConfig {
        user: Some(config.user.clone()),
        password: Some(config.password.expose_secret().clone()),
        host: Some(config.host.clone()),
        port: Some(config.port),
        dbname: Some(config.database.clone()),
        ssl_mode: Some(if config.tls_mode == TlsMode::Off {
            deadpool_postgres::SslMode::Disable
        } else {
            deadpool_postgres::SslMode::Require
        }),
        application_name: Some("Tobira".into()),
        .. PoolConfig::default()
    };

    debug!(
        "Connecting to 'postgresql://{}:*****@{}:{}/{}' (TLS: {:?})",
        config.user,
        config.host,
        config.port,
        config.database,
        config.tls_mode,
    );

    // Handle TLS and create pool.
    let pool = if config.tls_mode == TlsMode::Off {
        pool_config.create_pool(Some(Runtime::Tokio1), NoTls)?
    } else {
        // Prepare certificate store. If we do not verify the certificate, it's
        // just empty. Otherwise we load system-wide root CAs.
        let mut root_certs = rustls::RootCertStore::empty();
        if config.tls_mode == TlsMode::On {
            let system_certs = rustls_native_certs::load_native_certs()
                .context("failed to load all system-wide certificates")?;

            let system_count = system_certs.len();
            for cert in system_certs {
                root_certs.add(&rustls::Certificate(cert.0))
                    .context("failed to load system-wide certificate")?;
            }
            debug!("Loaded {system_count} system-wide certificates");

            // If a custom cert is given, we try to load it.
            if let Some(cert_path) = &config.server_cert {
                let custom_count = load_pem_file(cert_path, &mut root_certs)
                    .with_context(|| format!("failed to load '{}'", cert_path.display()))?;
                debug!("Loaded {} certificates from '{}'", custom_count, cert_path.display());
            }
        }

        let mut tls_config = rustls::ClientConfig::builder()
            .with_safe_defaults()
            .with_root_certificates(root_certs)
            .with_no_client_auth();

        // Disable certificate validation if requested.
        if config.tls_mode == TlsMode::WithoutVerifyCert {
            tls_config.dangerous().set_certificate_verifier(Arc::new(DangerousAlwaysAcceptCerts));
        }

        let tls = tokio_postgres_rustls::MakeRustlsConnect::new(tls_config);
        pool_config.create_pool(Some(Runtime::Tokio1), tls)?
    };
    info!("Created database pool");


    // Test the connection by executing a simple query.
    let client = pool.get().await
        .context("failed to get DB connection")?;
    client.execute("select 1", &[]).await
        .context("failed to execute DB test query")?;
    debug!("Successfully tested database connection with test query");


    // Make sure the database uses UTF8 encoding. There is no good reason to use
    // anything else.
    let encoding = client.query_one("show server_encoding;", &[]).await
        .context("failed to check server encoding")?
        .get::<_, String>(0);

    if encoding != "UTF8" {
        bail!("Database encoding is not UTF8, but Tobira requires UTF8!");
    }

    Ok(pool)
}

/// Checks out one DB connection from the pool or returns `Err` with a "service
/// unavailable" response.
pub(crate) async fn get_conn_or_service_unavailable(pool: &Pool) -> Result<DbConnection, Response> {
    let before = Instant::now();
    let connection = pool.get().await.map_err(|e| {
        error!("Failed to obtain DB connection for API request: {}", e);
        http::response::service_unavailable()
    })?;

    let acquire_conn_time = before.elapsed();
    if acquire_conn_time > Duration::from_millis(5) {
        warn!("Acquiring DB connection from pool took {:.2?}", acquire_conn_time);
    }

    Ok(connection)
}


/// Loads the PEM file at `path` and adds all X509 certificates in it to
/// `root_certs`. Returns an error if a non-x509 item is found. Returns the
/// number of certs added to `root_certs`.
fn load_pem_file(path: &Path, root_certs: &mut rustls::RootCertStore) -> Result<usize> {
    let file = fs::read(path).context("could not read file")?;

    let items = rustls_pemfile::read_all(&mut &*file).context("could not parse file as PEM")?;
    let count = items.len();
    for item in items {
        if let rustls_pemfile::Item::X509Certificate(cert) = item {
            root_certs.add(&rustls::Certificate(cert)).context("failed to load X509 certificate")?;
        } else {
            bail!("found unexpected item, expected X509 certificate");
        }
    }

    Ok(count)
}

/// Dummy certificate verifier, that blindly always says "it's valid". This is
/// used in the "don't check certificates" mode. Unfortunately, as rustls
/// values an API where it's hard to do potentially insecure things, it's a bit
/// of boilerplate.
pub(crate) struct DangerousAlwaysAcceptCerts;

impl ServerCertVerifier for DangerousAlwaysAcceptCerts {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::Certificate,
        _intermediates: &[rustls::Certificate],
        _server_name: &rustls::client::ServerName,
        _scts: &mut dyn Iterator<Item = &[u8]>,
        _ocsp_response: &[u8],
        _now: std::time::SystemTime,
    ) -> Result<ServerCertVerified, Error> {
        Ok(rustls::client::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::Certificate,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::Certificate,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        Ok(HandshakeSignatureValid::assertion())

    }
}
