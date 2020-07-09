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

        match (req.method(), req.uri().path()) {
            (&Method::GET, "/") => Assets::serve("index.html"),

            // The interactive GraphQL API explorer/IDE.
            //
            // TODO: do we want to remove this route in production?
            (&Method::GET, "/graphiql") => {
                let result = juniper_hyper::graphiql("/graphql", None);
                Box::pin(result)
            }

            // The actual GraphQL API.
            (&Method::GET, "/graphql") | (&Method::POST, "/graphql") => {
                let result = juniper_hyper::graphql(
                    self.root_node.clone(),
                    self.context.clone(),
                    req,
                );

                Box::pin(result)
            }

            (&Method::GET, path) if Assets::get(&path[1..]).is_some() => {
                // TODO: don't call `Assets::get` twice.
                Assets::serve(&path[1..])
            }

            // 404 for everything else
            (method, path) => {
                debug!("Responding with 404 to {:?} {}", method, path);
                let result = async {
                    let mut response = Response::new(Body::empty());
                    *response.status_mut() = StatusCode::NOT_FOUND;
                    Ok(response)
                };

                Box::pin(result)
            }
        }
    }
}

/// These are all static files we serve, including CSS and JS.
#[derive(rust_embed::RustEmbed)]
#[folder = "../frontend/build"]
struct Assets;

impl Assets {
    fn startup_check() -> Result<()> {
        if Self::get("index.html").is_none() {
            bail!("'index.html' is missing from the assets");
        }

        // TODO:
        // - somehow check that we didn't embed stuff we don't want
        // - check that all things we want are here?

        Ok(())
    }

    /// Responds with the asset identified by the given name.
    fn serve(name: &str) -> <RootService as Service<Request<Body>>>::Future {
        let body = Body::from(Assets::get(name).unwrap());
        let mime_guess = mime_guess::from_path(name).first();
        let out = async {
            let mut builder = Response::builder();
            if let Some(mime) = mime_guess {
                builder = builder.header("Content-Type", mime.to_string())
            }

            // TODO: content length
            // TODO: lots of other headers maybe

            Ok(builder.body(body).expect("bug: invalid response"))
        };

        Box::pin(out)
    }
}
