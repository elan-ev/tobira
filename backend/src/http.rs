//! The HTTP server, handler and routes.

use anyhow::{bail, Result};
use hyper::{
    Body, Method, Response, Server, StatusCode, Request,
    service::{make_service_fn, Service},
};
use log::{debug, info, trace};
use std::{
    sync::Arc,
    net::SocketAddr,
    task::{Context, Poll},
    pin::Pin,
    future::Future,
};

use crate::{api, config};


/// Starts the HTTP server. The future returned by this function must be awaited
/// to actually run it.
pub async fn serve(
    config: &config::Http,
    root_node: api::RootNode,
    context: api::Context,
) -> Result<()> {
    Assets::startup_check()?;

    let root_node = Arc::new(root_node);
    let context = Arc::new(context);

    // This factory is responsible to create new `RootService` instances
    // whenever hyper asks for one.
    let factory = make_service_fn(move |_| {
        trace!("Creating a new hyper `Service`");
        let service = RootService {
            root_node: root_node.clone(),
            context: context.clone(),
        };

        async move {
            Ok::<_, hyper::Error>(service)
        }
    });

    // Start the server with our service.
    let addr = SocketAddr::new(config.address, config.port);
    let server = Server::bind(&addr).serve(factory);
    info!("Listening on http://{}", server.local_addr());

    server.await?;

    Ok(())
}

/// The main "service" that answers HTTP requests.
struct RootService {
    root_node: Arc<api::RootNode>,
    context: Arc<api::Context>,
}

// This impl is mostly plumbing code, only the `call` method is interesting.
impl Service<Request<Body>> for RootService {
    type Response = Response<Body>;
    type Error = hyper::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _: &mut Context) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    /// This is the main entry point, called for each incoming request.
    fn call(&mut self, req: Request<Body>) -> Self::Future {
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

        match (method, path) {
            (&Method::GET, "/") => serve_index(),

            // The interactive GraphQL API explorer/IDE.
            //
            // TODO: do we want to remove this route in production?
            (&Method::GET, "/graphiql") => Box::pin(juniper_hyper::graphiql("/graphql", None)),

            // The actual GraphQL API.
            (&Method::GET, "/graphql") | (&Method::POST, "/graphql") => {
                let result = juniper_hyper::graphql(
                    self.root_node.clone(),
                    self.context.clone(),
                    req,
                );

                Box::pin(result)
            }

            // Realm pages
            (&Method::GET, path) if path.starts_with(REALM_PREFIX) => {
                let _realm_path = path.strip_prefix(REALM_PREFIX).unwrap();
                // TODO: check if path is valid

                serve_index()
            }

            // Assets (JS files, fonts, ...)
            (&Method::GET, path) if path.starts_with(ASSET_PREFIX) => {
                let asset_path = path.strip_prefix(ASSET_PREFIX).unwrap();
                Assets::serve(asset_path).unwrap_or_else(|| reply_404(method, path))
            }

            // 404 for everything else
            (method, path) => reply_404(method, path),
        }
    }
}

type ResponseFuture = <RootService as Service<Request<Body>>>::Future;

/// These are all static files we serve, including JS, fonts and images.
#[derive(rust_embed::RustEmbed)]
#[folder = "../frontend/build"]
struct Assets;

const INDEX_FILE: &str = "index.html";

impl Assets {
    fn startup_check() -> Result<()> {
        if Self::get(INDEX_FILE).is_none() {
            bail!("'index.html' is missing from the assets");
        }

        // TODO:
        // - somehow check that we didn't embed stuff we don't want
        // - check that all things we want are here?

        Ok(())
    }

    /// Responds with the asset identified by the given path. If there exists no
    /// asset with `path` or `path` is `INDEX_FILE`, `None` is returned.
    fn serve(path: &str) -> Option<ResponseFuture> {
        // The `index.html` here is not intended to be served directly. It is
        // modified and sent on many other routes.
        if path == INDEX_FILE {
            return None;
        }

        let body = Body::from(Assets::get(path)?);
        let mime_guess = mime_guess::from_path(path).first();
        let out = async {
            let mut builder = Response::builder();
            if let Some(mime) = mime_guess {
                builder = builder.header("Content-Type", mime.to_string())
            }

            // TODO: content length
            // TODO: lots of other headers maybe

            Ok(builder.body(body).expect("bug: invalid response"))
        };

        Some(Box::pin(out))
    }
}

/// Serves the main entry point of the application. This is replied to `/` and
/// other "public routes", like `/r/lectures`. Basically everywhere where the
/// user is supposed to see the website.
fn serve_index() -> ResponseFuture {
    let html = Assets::get(INDEX_FILE).unwrap();

    // TODO: include useful data into the HTML file

    let body = Body::from(html);
    let out = async {
        let mut builder = Response::builder();
        builder = builder.header("Content-Type", "text/html; charset=UTF-8");

        // TODO: content length
        // TODO: lots of other headers maybe

        Ok(builder.body(body).expect("bug: invalid response"))
    };

    Box::pin(out)
}

/// Replies with a 404 Not Found.
fn reply_404(method: &Method, path: &str) -> ResponseFuture {
    // TODO: have a simple and user calming body.

    debug!("Responding with 404 to {:?} {}", method, path);
    let result = async {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NOT_FOUND;
        Ok(response)
    };

    Box::pin(result)
}
