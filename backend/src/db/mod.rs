//! Database related things.

use deadpool_postgres::{Config as PoolConfig, Pool, Runtime};
use secrecy::{ExposeSecret, Secret};
use rustls::{
    Error, DigitallySignedStruct,
    client::danger::{ServerCertVerifier, ServerCertVerified, HandshakeSignatureValid},
};
use std::{
    fmt::Write,
    fs,
    path::{PathBuf, Path},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio_postgres::NoTls;

use crate::{http::{self, Response}, prelude::*, db::util::select};


pub(crate) mod cmd;
mod migrations;
mod query;
mod tx;
pub(crate) mod types;
pub(crate) mod util;

#[cfg(test)]
mod tests;

pub(crate) use self::{
    tx::Transaction,
    migrations::{migrate, MigrationPlan},
};


#[derive(Debug, confique::Config, Clone)]
#[config(validate = Self::validate)]
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

    {
        let DbConfig { user, host, port, database, tls_mode, .. } = &config;
        debug!(user, host, port, database, ?tls_mode, "Connecting to database");
    }

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
                root_certs.add(cert)
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
            .with_root_certificates(root_certs)
            .with_no_client_auth();

        // Disable certificate validation if requested.
        if config.tls_mode == TlsMode::WithoutVerifyCert {
            tls_config.dangerous().set_certificate_verifier(Arc::new(DangerousAlwaysAcceptCerts));
        }

        let tls = tokio_postgres_rustls::MakeRustlsConnect::new(tls_config);
        pool_config.create_pool(Some(Runtime::Tokio1), tls)?
    };
    debug!("Created database pool");


    // Test the connection by executing a simple query.
    let client = pool.get().await
        .context("failed to get DB connection")?;
    client.execute("select 1", &[]).await
        .context("failed to execute DB test query")?;
    trace!("Successfully tested database connection with test query");

    // Make sure the database uses UTF8 encoding. There is no good reason to use
    // anything else.
    let encoding = client.query_one("show server_encoding;", &[]).await
        .context("failed to check server encoding")?
        .get::<_, String>(0);

    if encoding != "UTF8" {
        bail!("Database encoding is not UTF8, but Tobira requires UTF8!");
    }


    // ----- Get some information about the server/connection ------------------------------------
    let search_path = client.query_one(&format!("show search_path"), &[])
        .await?
        .get::<_, String>(0);
    let server_version = client.query_one(&format!("show server_version"), &[])
        .await?
        .get::<_, String>(0);
    let server_version = server_version.trim()
        .split_once(' ')
        .map(|(first, _)| first)
        .unwrap_or(&server_version);
    // TODO: warn/error if the PG version is not supported?

    let (selection, mapping) = select!(
        full_version: "version()",
        user: "current_user",
        session_user,
        database: "current_database()",
        schema: "current_schema()",
    );
    let row = client.query_one(&format!("select {selection}"), &[]).await?;
    let full_version: String = mapping.full_version.of(&row);
    let user: String = mapping.user.of(&row);
    let session_user: String = mapping.session_user.of(&row);
    let database: String = mapping.database.of(&row);
    let schema: String = mapping.schema.of(&row);
    info!(server_version, user, session_user, schema, database, "Connected to DB!");
    trace!(tobira.multiline = true, full_version, %search_path, "Detailed PostgreSQL server info:");

    // Query permissions on schemata
    let (selection, mapping) = select!(
        schema_name,
        current_user_create: "pg_catalog.has_schema_privilege(current_user, schema_name, 'CREATE')",
        current_user_usage: "pg_catalog.has_schema_privilege(current_user, schema_name, 'USAGE')",
        session_user_create: "pg_catalog.has_schema_privilege(session_user, schema_name, 'CREATE')",
        session_user_usage: "pg_catalog.has_schema_privilege(session_user, schema_name, 'USAGE')",
    );
    let query = format!("\
        with schemas as (select schema_name from information_schema.schemata)
        select {selection} from schemas\
    ");
    match client.query(&query, &[]).await {
        Ok(rows) => {
            let mut log_output = "Schema permissions:".to_owned();
            for row in rows {
                let schema_name: String = mapping.schema_name.of(&row);
                let current_user_create: bool = mapping.current_user_create.of(&row);
                let current_user_usage: bool = mapping.current_user_usage.of(&row);
                let session_user_create: bool = mapping.session_user_create.of(&row);
                let session_user_usage: bool = mapping.session_user_usage.of(&row);
                write!(log_output, "\n{schema_name} -> \
                    current_user (create: {current_user_create}, usage: {current_user_usage}), \
                    session_user (create: {session_user_create}, usage: {session_user_usage})\
                ").unwrap();
            }
            trace!("{log_output}");
        }
        // The above query is a bit complex, is just for additional info
        // (not required to run Tobira) and uses pg_catalog which might change
        // in newer PG versions. So we won't fail if the query fails, but just
        // print a warning.
        Err(e) => {
            warn!("Could not query schema permissions: {e}");
        }
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
    let mut read = &*file;

    let items = rustls_pemfile::read_all(&mut read);
    let mut count = 0;
    for item in items {
        count += 1;
        let item = item.context("could not parse file as PEM")?;
        if let rustls_pemfile::Item::X509Certificate(cert) = item {
            root_certs.add(cert).context("failed to load X509 certificate")?;
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
#[derive(Debug)]
pub(crate) struct DangerousAlwaysAcceptCerts;

impl ServerCertVerifier for DangerousAlwaysAcceptCerts {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> std::prelude::v1::Result<ServerCertVerified, Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> std::prelude::v1::Result<HandshakeSignatureValid, Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> std::prelude::v1::Result<HandshakeSignatureValid, Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}
