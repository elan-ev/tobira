//! This tiny binary just export the GraphQL API Schema from the backend `api`
//! code. The schema is required for the frontend to compile.

use anyhow::Result;
use std::path::Path;

use tobira_api as api;

fn main() -> Result<()> {
    let schema = api::root_node().as_schema_language();

    if let Some(target) = std::env::args().nth(1) {
        if let Some(parent) = Path::new(&target).parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(target, schema)?;
    } else {
        println!("{}", schema);
    }

    Ok(())
}
