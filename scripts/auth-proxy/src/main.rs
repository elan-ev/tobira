use hyper::{
    Server,
    service::{make_service_fn, service_fn},
};
use std::{convert::Infallible, error::Error, net::SocketAddr, sync::Arc};
use structopt::StructOpt;

mod args;
mod proxy;

pub(crate) use self::{
    args::Args,
    proxy::ProxyTarget,
};


#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::from_args();
    let args = Arc::new(args);
    let port = args.port;

    let make_service = make_service_fn(move |_| {
        let args = Arc::clone(&args);

        async {
            Ok::<_, Infallible>(service_fn(move |req| {
                proxy::handle(req, Arc::clone(&args))
            }))
        }
    });

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("Tobira helper auth proxy listening on http://{}", addr);

    Server::try_bind(&addr)?
        .serve(make_service)
        .await?;

    Ok(())
}
