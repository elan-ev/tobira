//! The Olav backend server.

use anyhow::{Context, Result};


mod api;
mod db;
mod http;


#[tokio::main]
async fn main() -> Result<()> {
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
