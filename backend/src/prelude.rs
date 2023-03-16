//! Our own prelude that is wildcard imported in every other module. That way,
//! commonly used symbols are easily available.

pub(crate) use anyhow::{anyhow, bail, Context as _, Result};
pub(crate) use log::{error, warn, info, debug, trace, log};
pub(crate) use futures::{FutureExt as _, TryStreamExt as _};
pub(crate) use tap::Pipe;

pub(crate) use crate::{
    auth::HasRoles,
    db::util::{dbargs, FromDb},
    util::InspectExt,
};
