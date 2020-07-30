//! This tiny binary just export the GraphQL API Schema from the backend `api`
//! code. The schema is required for the frontend to compile.

use anyhow::Result;

#[path = "../api/mod.rs"]
mod api;

fn main() -> Result<()> {
    let schema = api::root_node().as_schema_language();

    if let Some(target) = std::env::args().nth(1) {
        std::fs::write(target, schema)?;
    } else {
        println!("{}", schema);
    }

    Ok(())
}
