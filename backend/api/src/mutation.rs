use juniper::EmptyMutation;
use super::Context;


/// The root mutation object.
///
/// Currently this does not offer any resolvers.
pub type Mutation = EmptyMutation<Context>;
