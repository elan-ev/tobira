//! The HTTP server, handler and routes.

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
use crate::{api, config};

// Our requests and responses always use the hyper provided body type.
type Response<T = Body> = hyper::Response<T>;
type Request<T = Body> = hyper::Request<T>;


/// Starts the HTTP server. The future returned by this function must be awaited
/// to actually run it.
pub(crate) async fn serve(
    config: &config::Http,
    api_root: api::RootNode,
    api_context: api::Context,
) -> Result<()> {
    let ctx = Arc::new(Context::new(api_root, api_context));

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
                        handle_panic(handle(req, Arc::clone(&ctx)))
                    }))
                }
            })
        }
    }


    // Start the server with our service.
    if let Some(unix_socket) = &config.unix_socket {
        // Bind to Unix domain socket.
        if unix_socket.exists() {
            fs::remove_file(unix_socket)?;
        }
        let server = Server::bind_unix(&unix_socket)?.serve(factory!());
        info!("Listening on unix://{}", unix_socket.display());
        let permissions = fs::Permissions::from_mode(config.unix_socket_permissions);
        fs::set_permissions(unix_socket, permissions)?;
        server.await?;
    } else {
        // Bind to TCP socket.
        let addr = SocketAddr::new(config.address, config.port);
        let server = Server::bind(&addr).serve(factory!());
        info!("Listening on http://{}", server.local_addr());
        server.await?;
    }

    Ok(())
}

/// This just wraps another future and catches all panics that might occur when
/// resolving/polling that given future. This ensures that we always answer with
/// `500` instead of just crashing the thread and closing the connection.
async fn handle_panic(
    future: impl Future<Output = Result<Response, hyper::Error>>,
) -> Result<Response, hyper::Error> {
    // The `AssertUnwindSafe` is unfortunately necessary. The whole story of
    // unwind safety is strange. What we are basically saying here is: "if the
    // future panicks, the global/remaining application state is not 'broken'.
    // It is safe to continue with the program in case of a panic."
    //
    // Hyper catches panics for us anyway, so this changes nothing except that
    // our response is better.
    match AssertUnwindSafe(future).catch_unwind().await {
        Ok(response) => response,
        Err(panic) => {
            // The `panic` information is just an `Any` object representing the
            // value the panic was invoked with. For most panics (which use
            // `panic!` like `println!`), this is either `&str` or `String`.
            let msg = panic.downcast_ref::<String>()
                .map(|s| s.as_str())
                .or(panic.downcast_ref::<&str>().map(|s| *s));

            // TODO: improve output.
            // - We probably want to print the HTTP request header line.
            // - It would be great to also print everything the panic hook would
            //   print, namely: location information and a backtrace. Do we
            //   install our own panic hook? Or is stdout piped into the log
            //   file anyway?
            match msg {
                Some(msg) => error!("HTTP handler panicked: '{}'", msg),
                None => error!("HTTP handler panicked"),
            }

            // TODO: potentially improve the response
            let error = Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body("Internal server error".into())
                .unwrap();

            Ok(error)
        }
    }
}

/// Context that the request handler has access to.
struct Context {
    api_root: Arc<api::RootNode>,
    api_context: Arc<api::Context>,
}

impl Context {
    fn new(api_root: api::RootNode, api_context: api::Context) -> Self {
        Self {
            api_root: Arc::new(api_root),
            api_context: Arc::new(api_context),
        }
    }
}

/// This is the main entry point, called for each incoming request.
async fn handle(req: Request<Body>, ctx: Arc<Context>) -> Result<Response, hyper::Error> {
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

    let response = match (method, path) {
        (&Method::GET, "/") => serve_index().await,

        // The interactive GraphQL API explorer/IDE. We actually keep this in
        // production as it does not hurt and in particular: does not expose any
        // information that isn't already exposed by the API itself.
        (&Method::GET, "/graphiql") => juniper_hyper::graphiql("/graphql", None).await?,

        // The actual GraphQL API.
        (&Method::GET, "/graphql") | (&Method::POST, "/graphql") => {
            juniper_hyper::graphql(ctx.api_root.clone(), ctx.api_context.clone(), req).await?
        }

        // Realm pages
        (&Method::GET, path) if path.starts_with(REALM_PREFIX) => {
            let _realm_path = &path[REALM_PREFIX.len()..];
            // TODO: check if path is valid

            serve_index().await
        }

        // Assets (JS files, fonts, ...)
        (&Method::GET, path) if path.starts_with(ASSET_PREFIX) => {
            let asset_path = &path[ASSET_PREFIX.len()..];
            match Assets::serve(asset_path).await {
                Some(r) => r,
                None => reply_404(method, path).await,
            }
        }

        // 404 for everything else
        (method, path) => reply_404(method, path).await,
    };

    Ok(response)
}

/// These are all static files we serve, including JS, fonts and images.
#[derive(rust_embed::RustEmbed)]
#[folder = "../../frontend/build"]
struct Assets;

const INDEX_FILE: &str = "index.html";

impl Assets {
    /// Responds with the asset identified by the given path. If there exists no
    /// asset with `path` or `path` is `INDEX_FILE`, `None` is returned.
    async fn serve(path: &str) -> Option<Response> {
        // The `index.html` here is not intended to be served directly. It is
        // modified and sent on many other routes.
        if path == INDEX_FILE {
            return None;
        }

        let body = Body::from(Assets::get(path)?);
        let mime_guess = mime_guess::from_path(path).first();
        let mut builder = Response::builder();
        if let Some(mime) = mime_guess {
            builder = builder.header("Content-Type", mime.to_string())
        }

        // TODO: content length
        // TODO: lots of other headers maybe

        Some(builder.body(body).expect("bug: invalid response"))
    }
}

/// Serves the main entry point of the application. This is replied to `/` and
/// other "public routes", like `/r/lectures`. Basically everywhere where the
/// user is supposed to see the website.
async fn serve_index() -> Response {
    let html = Assets::get(INDEX_FILE).unwrap();

    // TODO: include useful data into the HTML file

    let body = Body::from(html);
    let mut builder = Response::builder();
    builder = builder.header("Content-Type", "text/html; charset=UTF-8");

    // TODO: content length
    // TODO: lots of other headers maybe

    builder.body(body).expect("bug: invalid response")
}

/// Replies with a 404 Not Found.
async fn reply_404(method: &Method, path: &str) -> Response {
    debug!("Responding with 404 to {:?} {}", method, path);

    // We simply send the normal index and let the frontend router determinate
    // this is a 404. That way, our 404 page looks like the main page and users
    // are not confused. And it's easier to return to the normal page.
    //
    // TODO: I am somewhat uneasy about this code assuming the router of the
    // frontend is the same as the backend router. Maybe we want to indicate to
    // the frontend explicitly to show a 404 page? However, without redirecting
    // to like `/404` because that's annoying for users.
    let html = Assets::get(INDEX_FILE).unwrap();
    let body = Body::from(html);

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/html; charset=UTF-8")
        .body(body)
        .unwrap()
}
