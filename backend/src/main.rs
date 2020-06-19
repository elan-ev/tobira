//! The Olav backend server.

mod api;
mod db;
mod http;


// TODO: figure out error handling
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    pretty_env_logger::init();

    let addr = ([127, 0, 0, 1], 3000).into();
    let root_node = api::root_node();
    let context = api::Context {
        db: db::create_pool()?,
    };

    let server = http::serve(&addr, root_node, context);
    println!("Listening on http://{}", addr);

    server.await?;

    Ok(())
}
