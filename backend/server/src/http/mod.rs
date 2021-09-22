//! The HTTP server, handler and routes.

use api::Transaction;
use deadpool_postgres::Pool;
use futures::FutureExt;
use hyper::{
    Body, Method, Server, StatusCode,
    service::{make_service_fn, service_fn},
};
use hyperlocal::UnixServerExt;
use std::{
    convert::Infallible,
    fs,
    future::Future,
    mem,
    net::{IpAddr, SocketAddr},
    os::unix::fs::PermissionsExt,
    panic::AssertUnwindSafe,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use tobira_util::prelude::*;
use crate::{api, config::Config};
use self::assets::Assets;

mod assets;


#[derive(Debug, confique::Config)]
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


/// Starts the HTTP server. The future returned by this function must be awaited
/// to actually run it.
pub(crate) async fn serve(
    config: &Config,
    api_root: api::RootNode,
    db: Pool,
) -> Result<()> {
    let assets = Assets::init(config).await.context("failed to initialize assets")?;
    let ctx = Arc::new(Context::new(api_root, db, assets));

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
    if let Some(unix_socket) = &config.http.unix_socket {
        // Bind to Unix domain socket.
        if unix_socket.exists() {
            fs::remove_file(unix_socket)?;
        }
        let server = Server::bind_unix(&unix_socket)?.serve(factory!());
        info!("Listening on unix://{}", unix_socket.display());
        let permissions = fs::Permissions::from_mode(config.http.unix_socket_permissions);
        fs::set_permissions(unix_socket, permissions)?;
        server.await?;
    } else {
        // Bind to TCP socket.
        let addr = SocketAddr::new(config.http.address, config.http.port);
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

/// Context that the request handler has access to.
struct Context {
    api_root: Arc<api::RootNode>,
    db_pool: Pool,
    assets: Assets,
}

impl Context {
    fn new(api_root: api::RootNode, db_pool: Pool, assets: Assets) -> Self {
        Self {
            api_root: Arc::new(api_root),
            db_pool,
            assets,
        }
    }
}

/// This is the main entry point, called for each incoming request.
async fn handle(req: Request<Body>, ctx: Arc<Context>) -> Response {
    trace!(
        "Incoming HTTP {:?} request to '{}{}'",
        req.method(),
        req.uri().path(),
        req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default(),
    );

    let method = req.method().clone();
    let path = req.uri().path().trim_end_matches('/');

    const ASSET_PREFIX: &str = "/~assets/";

    match path {
        // The GraphQL endpoint. This is the only path for which POST is
        // allowed.
        "/graphql" if method == Method::POST => handle_api(req, &ctx).await,

        // From this point on, we only support GET and HEAD requests. All others
        // will result in 404.
        _ if method != Method::GET && method != Method::HEAD => {
            Response::builder()
                .status(StatusCode::METHOD_NOT_ALLOWED)
                .header("Content-Type", "text/plain; charset=UTF-8")
                .body(Body::from("405 Method not allowed"))
                .unwrap()
        }

        // Assets (JS files, fonts, ...)
        path if path.starts_with(ASSET_PREFIX) => {
            let asset_path = &path[ASSET_PREFIX.len()..];
            match ctx.assets.serve(asset_path).await {
                Some(r) => r,
                None => reply_404(&ctx.assets, &method, path).await,
            }
        }


        // ----- Special, internal routes, starting with `/~` ----------------------------------
        "/~tobira"
        | "/~manage"
        | "/~manage/realm"
        | "/~manage/realm/add-child" => ctx.assets.serve_index().await,

        // The interactive GraphQL API explorer/IDE. We actually keep this in
        // production as it does not hurt and in particular: does not expose any
        // information that isn't already exposed by the API itself.
        "/~graphiql" => juniper_hyper::graphiql("/graphql", None).await,

        path if path.starts_with("/~") => reply_404(&ctx.assets, &method, path).await,


        // Currently we just reply with our `index.html` to everything else.
        // That's of course not optimal because for many paths, our frontend
        // will show 404. It would be nice to reply 404 from the server
        // instead. But in order to do that, we would have to duplicate some
        // logic here. And since then we need to do a database lookup anyway,
        // we should probably already use that data and include it in the
        // `index.html`.
        //
        // I think doing all that is a good idea as soon as our routing logic is
        // fixed and doesn't change anymore. But for now, we avoid the
        // duplicate logic. So yeah:
        //
        // TODO: fix that at some point ^
        _ => ctx.assets.serve_index().await,
    }
}

/// Replies with a 404 Not Found.
pub(crate) async fn reply_404(assets: &Assets, method: &Method, path: &str) -> Response {
    debug!("Responding with 404 to {:?} '{}'", method, path);

    // We simply send the normal index and let the frontend router determinate
    // this is a 404. That way, our 404 page looks like the main page and users
    // are not confused. And it's easier to return to the normal page.
    //
    // TODO: I am somewhat uneasy about this code assuming the router of the
    // frontend is the same as the backend router. Maybe we want to indicate to
    // the frontend explicitly to show a 404 page? However, without redirecting
    // to like `/404` because that's annoying for users.
    let html = assets.index().await;
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/html; charset=UTF-8")
        .body(html)
        .unwrap()
}

async fn handle_api(req: Request<Body>, ctx: &Context) -> Response {
    let before = Instant::now();

    // Get a connection for this request.
    let mut connection = match ctx.db_pool.get().await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to obtain DB connection for API request: {}", e);
            return service_unavailable();
        }
    };

    let acquire_conn_time = before.elapsed();
    if acquire_conn_time > Duration::from_millis(5) {
        warn!("Acquiring DB connection from pool took {:.2?}", acquire_conn_time);
    }

    let tx = match connection.transaction().await {
        Ok(tx) => tx,
        Err(e) => {
            error!("Failed to start transaction for API request: {}", e);
            return internal_server_error();
        }
    };

    // Okay, lets take a deep breath.
    //
    // Unfortunately, `juniper` does not support contexts with a lifetime
    // parameter. However, we'd like to have one SQL transaction per API
    // request. The transaction type (`deadpool_postgres::Transaction`) borrows
    // from the DB connection (`tokio_postgres::Client`) and thus has a
    // lifetime parameter. This makes sense for the API of that library since
    // it statically prevents a number of logic bugs. But it is inconvenient
    // for us.
    //
    // Unfortunately, we think the best solution for us is to use `unsafe` here
    // to just get rid of the lifetime parameter. We can pretend that the
    // lifetime is `'static`. Of course, we then have to make sure that the
    // transaction does not outlive the borrowed connection. We do that by
    // putting the transaction into an `Arc`. That way we can check whether
    // there still exists a reference after calling the API handlers. The
    // transaction is not `Clone` and `Arc` only gives an immutable reference
    // to the underlying value. So even a buggy handler could not move the
    // transaction out of the `Arc`.
    //
    // Unfortunately, `connection` is not treated as borrowed after this unsafe
    // block. So we must make sure not to access it at all until we get rid of
    // the transaction (by committing it below).
    type PgTx<'a> = deadpool_postgres::Transaction<'a>;
    let tx = unsafe {
        let static_tx = mem::transmute::<PgTx<'_>, PgTx<'static>>(tx);
        Arc::new(static_tx)
    };

    let api_context = Arc::new(api::Context::new(Transaction::new(tx.clone())));
    let out = juniper_hyper::graphql(ctx.api_root.clone(), api_context.clone(), req).await;
    let num_queries = api_context.db.num_queries();
    drop(api_context);

    // Check whether we own the last remaining handle of this Arc.
    let out = match Arc::try_unwrap(tx) {
        Err(_) => {
            // There are still other handles, meaning that the API handler
            // incorrectly stored the transaction in some static variable. This
            // is our fault and should NEVER happen. If it does happen, we
            // would have UB after this function exits. We can't have that. And
            // since panicking only brings down the current thread, we have to
            // reach for more drastic measures.
            error!("FATAL BUG: API handler kept reference to transaction. Ending process.");
            std::process::abort();
        }
        Ok(tx) => {
            match tx.commit().await {
                // If the transaction succeeded we can return the generated response.
                Ok(_) => out,

                // Otherwise, we would like to retry a couple times, but for now
                // we just immediately reply 5xx.
                //
                // TODO: write `graphql_hyper` logic ourselves to be able to put
                // all of this code in a loop and retry a couple times.
                Err(e) => {
                    error!("Failed to commit transaction for API request: {}", e);
                    service_unavailable()
                }
            }
        }
    };

    debug!(
        "Finished /graphql query in {:.2?} (with {} SQL queries)",
        before.elapsed(),
        num_queries,
    );

    out
}

fn service_unavailable() -> Response {
    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .body("Server error: service unavailable. Potentially try again later.".into())
        .unwrap()
}

fn internal_server_error() -> Response {
    Response::builder()
        .status(StatusCode::INTERNAL_SERVER_ERROR)
        .body("Internal server error".into())
        .unwrap()
}
