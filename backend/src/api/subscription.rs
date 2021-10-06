use juniper::EmptySubscription;
use super::Context;


/// The root subscription object.
///
/// Currently this does not offer any resolvers.
pub(crate) type Subscription = EmptySubscription<Context>;
