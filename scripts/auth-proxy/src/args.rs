use structopt::StructOpt;

use crate::ProxyTarget;


#[derive(Debug, StructOpt)]
#[structopt(about = "Dummy auth proxy for testing Tobira")]
pub(crate) struct Args {
    /// Proxy target (where requests are forwarded to).
    #[structopt(short, long, default_value = "localhost:3080")]
    pub(crate) target: ProxyTarget,

    /// Port to listen on.
    #[structopt(short, long, default_value = "3081")]
    pub(crate) port: u16,
}
