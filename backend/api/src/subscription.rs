use juniper::EmptySubscription;
use super::Context;


/// The root subscription object.
///
/// Currently this does not offer any resolvers.
pub type Subscription = EmptySubscription<Context>;
