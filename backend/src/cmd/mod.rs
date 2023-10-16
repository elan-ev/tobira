use crate::prelude::*;

pub(crate) mod export_api_schema;
pub(crate) mod import_realm_tree;
pub(crate) mod check;
pub(crate) mod known_groups;


/// Reads stdin and returns an error if the trimmed input is not exactly "yes".
pub(crate) fn prompt_for_yes() -> Result<()> {
    let mut line = String::new();
    std::io::stdin().read_line(&mut line).context("could not read from stdin")?;
    if line.trim() != "yes" {
        println!("Answer was not 'yes'. Aborting.");
        bail!("user did not confirm: operation was aborted.");
    }
    Ok(())
}
