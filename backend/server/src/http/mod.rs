//! The HTTP server, handler and routes.

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
    net::SocketAddr,
    os::unix::fs::PermissionsExt,
    panic::AssertUnwindSafe,
    sync::Arc,
};

use tobira_util::prelude::*;
use crate::{api, config::Config, db};
use self::assets::Assets;

mod assets;


// Our requests and responses always use the hyper provided body type.
type Response<T = Body> = hyper::Response<T>;
type Request<T = Body> = hyper::Request<T>;


/// Starts the HTTP server. The future returned by this function must be awaited
/// to actually run it.
pub(crate) async fn serve(
    config: &Config,
    api_root: api::RootNode,
) -> Result<()> {
    let assets = Assets::init(&config.assets).await.context("failed to initialize assets")?;

    let db = db::create_pool(&config.db).await
        .context("failed to create database connection pool (database not running?)")?;
    db::migrate(&mut *db.get().await?).await
        .context("failed to check/run DB migrations")?;

    let ctx = Arc::new(Context::new(api_root, assets, db));

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
    future: impl Future<Output = Result<Response>>,
) -> Result<Response, Infallible> {
    fn internal_server_error() -> Response {
        Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body("Internal server error".into())
            .unwrap()
    }

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
        Ok(Ok(response)) => Ok(response),
        Ok(Err(e)) => {
            error!("INTERNAL SERVER ERROR: HTTP handler returned `Err(_)`: {:?}", e);
            Ok(internal_server_error())
        }
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
    db: Pool,
    assets: Assets,
}

impl Context {
    fn new(api_root: api::RootNode, assets: Assets, db: Pool) -> Self {
        Self {
            api_root: Arc::new(api_root),
            db,
            assets,
        }
    }
}

/// This is the main entry point, called for each incoming request.
async fn handle(req: Request<Body>, ctx: Arc<Context>) -> Result<Response> {
    trace!(
        "Incoming HTTP {:?} request to '{}{}'",
        req.method(),
        req.uri().path(),
        req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default(),
    );

    let method = req.method();
    let path = req.uri().path();

    const ASSET_PREFIX: &str = "/assets/";
    const REALM_PREFIX: &str = "/r/";
    const PLAYER_PREFIX: &str = "/v/";

    let response = match (method, path) {
        (&Method::GET, "/") | (&Method::GET, "/about") => ctx.assets.serve_index().await,

        // The interactive GraphQL API explorer/IDE. We actually keep this in
        // production as it does not hurt and in particular: does not expose any
        // information that isn't already exposed by the API itself.
        (&Method::GET, "/graphiql") => juniper_hyper::graphiql("/graphql", None).await?,

        // The actual GraphQL API.
        (&Method::GET, "/graphql") | (&Method::POST, "/graphql") => {
            let request_context = Arc::new(
                api::Context::new(
                    ctx.db.get().await?
                ).await?
            );
            juniper_hyper::graphql(ctx.api_root.clone(), request_context, req).await?
        }

        // Realm pages
        (&Method::GET, path) if path.starts_with(REALM_PREFIX) => {
            let _realm_path = &path[REALM_PREFIX.len()..];
            // TODO: check if path is valid

            ctx.assets.serve_index().await
        }

        // The player page
        (&Method::GET, path) if path.starts_with(PLAYER_PREFIX) => {
            ctx.assets.serve_index().await
        }

        // Assets (JS files, fonts, ...)
        (&Method::GET, path) if path.starts_with(ASSET_PREFIX) => {
            let asset_path = &path[ASSET_PREFIX.len()..];
            match ctx.assets.serve(asset_path).await {
                Some(r) => r,
                None => reply_404(&ctx.assets, method, path).await,
            }
        }

        // 404 for everything else
        (method, path) => reply_404(&ctx.assets, method, path).await,
    };

    Ok(response)
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
