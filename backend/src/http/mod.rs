//! The HTTP server, handler and routes.
//!
//! This file itself contains fairly little business logic and just sets up the
//! `hyper` server and catches errors. The main logic is in `handlers.rs`.

use deadpool_postgres::Pool;
use hyper::{
    Body, Server,
    service::{make_service_fn, service_fn},
};
use hyperlocal::UnixServerExt;
use std::{
    convert::Infallible,
    fs,
    future::Future,
    net::{IpAddr, SocketAddr},
    os::unix::fs::PermissionsExt,
    panic::AssertUnwindSafe,
    path::PathBuf,
    sync::Arc,
};

use crate::{api, config::Config, prelude::*};
use self::{
    assets::Assets,
    handlers::{handle, internal_server_error},
};


mod assets;
pub(crate) mod auth;
mod handlers;


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
type Response<T = Body> = hyper::Response<T>;
type Request<T = Body> = hyper::Request<T>;


/// Context that the request handler has access to.
struct Context {
    api_root: Arc<api::RootNode>,
    db_pool: Pool,
    assets: Assets,
    config: Config,
}


/// Starts the HTTP server. The future returned by this function must be awaited
/// to actually run it.
pub(crate) async fn serve(
    config: Config,
    api_root: api::RootNode,
    db: Pool,
) -> Result<()> {
    let assets = Assets::init(&config).await.context("failed to initialize assets")?;
    let http_config = config.http.clone();
    let ctx = Arc::new(Context {
        api_root: Arc::new(api_root),
        db_pool: db,
        assets,
        config,
    });

    // This sets up all the hyper server stuff. It's a bit of magic and touching
    // this code likely results in strange lifetime errors.
    //
    // In short: a hyper "service" is something that can handle requests. The
    // outer closure is called whenever hyper needs a new service instance (as
    // far as I understand it, it does that only for each worker thread, for
    // example). The inner closure is actually called each time a request is
    // received. Seems a bit more complicated than a single "handler" function,
    // but I'm sure hyper knows what they are doing.
    //
    // All our logic is encoded in the function `handle`. The only thing we are
    // doing here is to pass the context to that function, and clone its `Arc`
    // accordingly.
    //
    // We wrap the factory definition in a macro because we need two slightly
    // different factories. One for binding to a unix socket and one for
    // binding to a TCP socket. The code for defining the factory is exactly
    // the same, but due to type inference, it results in a different type. The
    // macro avoids code duplication.
    macro_rules! factory {
        () => {
            make_service_fn(move |_| {
                let ctx = Arc::clone(&ctx);
                async {
                    Ok::<_, Infallible>(service_fn(move |req| {
                        handle_internal_errors(handle(req, Arc::clone(&ctx)))
                    }))
                }
            })
        }
    }


    // Start the server with our service.
    if let Some(unix_socket) = &http_config.unix_socket {
        // Bind to Unix domain socket.
        if unix_socket.exists() {
            fs::remove_file(unix_socket)?;
        }
        let server = Server::bind_unix(&unix_socket)?.serve(factory!());
        info!("Listening on unix://{}", unix_socket.display());
        let permissions = fs::Permissions::from_mode(http_config.unix_socket_permissions);
        fs::set_permissions(unix_socket, permissions)?;
        server.await?;
    } else {
        // Bind to TCP socket.
        let addr = SocketAddr::new(http_config.address, http_config.port);
        let server = Server::bind(&addr).serve(factory!());
        info!("Listening on http://{}", server.local_addr());
        server.await?;
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

            Ok(internal_server_error())
        }
    }
}
