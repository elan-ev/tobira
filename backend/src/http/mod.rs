//! The HTTP server, handler and routes.
//!
//! This file itself contains fairly little business logic and just sets up the
//! `hyper` server and catches errors. The main logic is in `handlers.rs`.

use deadpool_postgres::Pool;
use hyper::service::service_fn;
use hyper_util::{rt::{TokioExecutor, TokioIo}, server::conn::auto::Builder};
use hyperlocal::UnixClientExt;
use tokio::net::{TcpListener, UnixListener};
use std::{
    convert::Infallible,
    fs,
    future::Future,
    net::{IpAddr, SocketAddr},
    os::unix::fs::PermissionsExt,
    panic::AssertUnwindSafe,
    path::PathBuf,
    sync::Arc, time::Duration,
};

use crate::{
    api,
    auth::{self, JwtContext},
    config::Config,
    default_enable_backtraces,
    metrics,
    prelude::*,
    search,
    sync::OcClient,
    util::{self, ByteBody, HttpsClient, UdxHttpClient},
};
use self::{
    assets::Assets,
    handlers::handle,
};


mod assets;
mod handlers;
mod log;
pub(crate) mod response;


/// HTTP server configuration.
#[derive(Debug, Clone, confique::Config)]
pub(crate) struct HttpConfig {
    /// The TCP port the HTTP server should listen on.
    #[config(default = 3080)]
    pub(crate) port: u16,

    /// The bind address to listen on.
    #[config(default = "127.0.0.1")]
    pub(crate) address: IpAddr,

    /// Unix domain socket to listen on. Specifying this will overwrite
    /// the TCP configuration. Example: "/tmp/tobira.socket".
    pub(crate) unix_socket: Option<PathBuf>,

    /// Unix domain socket file permissions.
    #[config(default = 0o755)]
    pub(crate) unix_socket_permissions: u32,
}


// Our requests and responses always use the hyper provided body type.
pub(crate) type Response = hyper::Response<ByteBody>;
// pub(crate) type Request<T = Body> = hyper::Request<T>;


/// Context that the request handler has access to.
pub(crate) struct Context {
    pub(crate) api_root: Arc<api::RootNode>,
    pub(crate) db_pool: Pool,
    pub(crate) assets: Assets,
    pub(crate) config: Arc<Config>,
    pub(crate) jwt: Arc<JwtContext>,
    pub(crate) search: Arc<search::Client>,
    pub(crate) metrics: Arc<metrics::Metrics>,
    pub(crate) auth_caches: auth::Caches,
    pub(crate) http_client: HttpsClient<ByteBody>,
    pub(crate) uds_http_client: UdxHttpClient<ByteBody>,
    pub(crate) oc_client: Arc<OcClient>,
}


/// Starts the HTTP server. The future returned by this function must be awaited
/// to actually run it.
pub(crate) async fn serve(
    config: Config,
    api_root: api::RootNode,
    db: Pool,
    search: search::Client,
) -> Result<()> {
    let assets = Assets::init(&config).await.context("failed to initialize assets")?;
    let http_config = config.http.clone();
    let ctx = Arc::new(Context {
        api_root: Arc::new(api_root),
        db_pool: db,
        assets,
        jwt: Arc::new(JwtContext::new(&config.auth.jwt)?),
        search: Arc::new(search),
        metrics: Arc::new(metrics::Metrics::new()),
        auth_caches: auth::Caches::new(),
        http_client: util::http_client().context("failed to create HTTP client")?,
        uds_http_client: UdxHttpClient::unix(),
        oc_client: Arc::new(OcClient::new(&config).context("Failed to create Opencast client")?),
        config: Arc::new(config),
    });

    let ctx_clone = ctx.clone();
    tokio::spawn(async move {
        ctx_clone.auth_caches.maintainence_task(&ctx_clone.config).await;
    });
    let graceful = hyper_util::server::graceful::GracefulShutdown::new();
    let mut signal = std::pin::pin!(shutdown_signal());

    // Helper macro to avoid duplicate code. It's basically just an abstraction
    // over TcpListener and UnixListener, which is otherwise annoying to do.
    macro_rules! listen {
        ($listener:ident) => {
            default_enable_backtraces();

            loop {
                tokio::select! {
                    conn = $listener.accept() => {
                        let (tcp, _) = conn.context("failed to accept TCP connection")?;
                        let io = TokioIo::new(tcp);

                        let ctx = Arc::clone(&ctx);
                        let watcher = graceful.watcher();
                        tokio::task::spawn(async move {
                            let builder = Builder::new(TokioExecutor::new());
                            let handle_conn = builder.serve_connection(io, service_fn(move |req| {
                                handle_internal_errors(handle(req, Arc::clone(&ctx)))
                            }));
                            let handle_conn = watcher.watch(handle_conn);
                            if let Err(e) = handle_conn.await {
                                warn!("Error serving connection: {e:#}");
                            }
                        });
                    }

                    _ = &mut signal => {
                        info!("Shutdown signal received");
                        break;
                    }
                }
            }
        };
    }


    if let Some(unix_socket) = &http_config.unix_socket {
        // Bind to Unix domain socket.
        if unix_socket.exists() {
            fs::remove_file(unix_socket)?;
        }
        let listener = UnixListener::bind(unix_socket)
            .context(format!("failed to bind unix socket {}", unix_socket.display()))?;
        let permissions = fs::Permissions::from_mode(http_config.unix_socket_permissions);
        fs::set_permissions(unix_socket, permissions)?;
        info!("Listening on unix://{}", unix_socket.display());
        listen!(listener);
    } else {
        // Bind to TCP socket.
        let addr = SocketAddr::new(http_config.address, http_config.port);
        let listener = TcpListener::bind(&addr).await
            .context(format!("failed to bind socket address {addr}"))?;
        info!("Listening on http://{}",
            listener.local_addr().context("failed to acquire local addr")?);
        listen!(listener);
    }

    tokio::select! {
        _ = graceful.shutdown() => {
            info!("All HTTP connections gracefully closed");
        },
        _ = tokio::time::sleep(Duration::from_secs(1)) => {
            eprintln!("Timed out waiting for all HTTP connections to close");
        }
    }

    Ok(())
}

/// This just wraps another future and catches all panics that might occur when
/// resolving/polling that given future. This ensures that we always answer with
/// `500` instead of just crashing the thread and closing the connection.
async fn handle_internal_errors(
    future: impl Future<Output = Response>,
) -> Result<Response, Infallible> {
    // TODO: We want to log lots of information about the exact HTTP request in
    // the error case.

    // The `AssertUnwindSafe` is unfortunately necessary. The whole story of
    // unwind safety is strange. What we are basically saying here is: "if the
    // future panicks, the global/remaining application state is not 'broken'.
    // It is safe to continue with the program in case of a panic."
    //
    // Hyper catches panics for us anyway, so this changes nothing except that
    // our response is better.
    match AssertUnwindSafe(future).catch_unwind().await {
        Ok(response) => Ok(response),
        Err(panic) => {
            // The `panic` information is just an `Any` object representing the
            // value the panic was invoked with. For most panics (which use
            // `panic!` like `println!`), this is either `&str` or `String`.
            let msg = panic.downcast_ref::<String>()
                .map(|s| s.as_str())
                .or(panic.downcast_ref::<&str>().map(|s| *s));

            // TODO: It would be great to also log everything the panic hook
            // would print, namely: location information and a backtrace. Do we
            // install our own panic hook? Or is stdout piped into the log file
            // anyway?
            match msg {
                Some(msg) => error!("INTERNAL SERVER ERROR: HTTP handler panicked: '{}'", msg),
                None => error!("INTERNAL SERVER ERROR: HTTP handler panicked"),
            }

            Ok(response::internal_server_error())
        }
    }
}

/// Future that resolves when a shutdown signal is received by our app.
async fn shutdown_signal() {
    // Wait for the CTRL+C signal
    tokio::signal::ctrl_c()
        .await
        .expect("failed to install CTRL+C signal handler");
}
