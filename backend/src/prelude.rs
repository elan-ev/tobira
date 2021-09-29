//! Our own prelude that is wildcard imported in every other module. That way,
//! commonly used symbols are easily available.

pub use anyhow::{anyhow, bail, Context as _, Result};
pub use log::{error, warn, info, debug, trace};
