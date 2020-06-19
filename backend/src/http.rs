//! The HTTP server, handler and routes.

use anyhow::Result;
use hyper::{
    Body, Method, Response, Server, StatusCode, Request,
    service::{make_service_fn, Service},
};
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
    let root_node = Arc::new(root_node);
    let context = Arc::new(context);

    // This factory is responsible to create new `RootService` instances
    // whenever hyper asks for one.
    let factory = make_service_fn(move |_| {
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
    println!("Listening on http://{}", server.local_addr());

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
        match (req.method(), req.uri().path()) {
            // The interactive GraphQL API explorer/IDE.
            //
            // TODO: do we want to remove this route in production?
            // TODO: this should not be served from `/`. This is temporary.
            (&Method::GET, "/graphiql") | (&Method::GET, "/") => {
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

            // 404 for everything else
            _ => {
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
