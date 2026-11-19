use juniper::{graphql_value, http::{GraphQLRequest, GraphQLResponse}, GraphQLError};
use std::fmt;

use crate::prelude::*;
use super::{Context, RootNode};


/// The result of successfully executing a GraphQL request, with some metadata.
pub(crate) struct ExecuteOutput {
    /// The response to send to the client. Might still contain GraphQL errors.
    pub(crate) response: GraphQLResponse,

    /// Number of SQL queries executed while resolving the request.
    pub(crate) num_queries: u32,
}

/// Errors of `execute` that cannot be expressed as `GraphQLResponse`.
#[derive(Debug)]
pub(crate) enum ExecuteError {
    /// The request could not be executed at all, e.g. because the query is
    /// invalid.
    InvalidRequest(GraphQLError),

    /// Committing the DB transaction failed after successful execution. The
    /// DB error was already logged.
    Commit,
}

/// Executes the given GraphQL request. The DB transaction in `context` is
/// committed if there were no errors, and rolled back otherwise.
pub(crate) async fn execute(
    root: &RootNode,
    context: Context,
    req: &GraphQLRequest,
) -> Result<ExecuteOutput, ExecuteError> {
    struct GqlReqPrinter<'a>(&'a GraphQLRequest);
    impl fmt::Display for GqlReqPrinter<'_> {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            writeln!(f, "Query:\n{}", self.0.query)?;
            writeln!(f, "Operation name: {:?}", self.0.operation_name)?;
            writeln!(f, "Variables: {}", serde_json::to_string_pretty(&self.0.variables).unwrap())?;
            Ok(())
        }
    }


    let gql_result = juniper::execute(
        &req.query,
        req.operation_name.as_deref(),
        root,
        &req.variables(),
        &context,
    ).await;

    // Get some values out of the context before dropping it
    let num_queries = context.db.num_queries();
    let tx = context.db;


    // Check if any errors occured.
    macro_rules! log_and_rollback {
        () => {
            debug!("Failed request:\n{}", GqlReqPrinter(req));
            debug!("Rolling back DB transaction...");
            if let Err(e) = tx.rollback().await {
                error!("Failed to rollback transaction: {e}\nWill give up now. Transaction \
                    should be rolled back automatically since it won't be committed.");
            }
        };
    }

    let response = match gql_result {
        Err(e) => {
            // This kind of error only seems to happen when there is something
            // wrong with the request. It's unlikely that any SQL queries have
            // been executed, but we roll back the transaction anyway.
            warn!("GraphQL request error: {e}");
            log_and_rollback!();
            return Err(ExecuteError::InvalidRequest(e));
        }

        Ok((value, errors)) if !errors.is_empty() => {
            let error_to_msg = |e: &juniper::ExecutionError<juniper::DefaultScalarValue>| {
                format!("{} (at `{}`)", e.error().message(), e.path().join("."))
            };

            warn!(
                "Error{} during GraphQL execution: {}",
                if errors.len() > 1 { "s" } else { "" },
                if errors.len() > 1 {
                    errors.iter().map(|e| format!("\n- {}", error_to_msg(e))).collect::<String>()
                } else {
                    error_to_msg(&errors[0])
                },
            );
            log_and_rollback!();

            // We just return all errors as normal GraphQL errors, BUT we return
            // no regular data as that might contain data from the DB
            // transaction that was rolled back. That is, with the exception of
            // `currentUser` which contains no data from the DB at all. That's
            // what the following code does: inspect the prepared value and
            // extract only what we can give out.
            let mut data = juniper::Value::Null;
            let user = value.as_object_value()
                .and_then(|o| o.get_field_value("currentUser"))
                .and_then(|v| v.as_object_value());
            if let Some(user) = user {
                // Not even all fields are allowed. `myVideos` for example
                // contains DB data.
                let allowed_fields = [
                    "username", "displayName", "roles", "email",
                    "canUpload", "canUseStudio", "canUseEditor",
                ];
                let filtered = user.clone().into_iter()
                    .filter(|(k, _)| allowed_fields.contains(&k.as_str()))
                    .collect::<juniper::Object<juniper::DefaultScalarValue>>();
                data = graphql_value!({ "currentUser": filtered });
            }

            GraphQLResponse::from_result(Ok((data, errors)))
        }

        Ok((value, _)) => {
            // There was no error dealing with this request so we can commit the DB
            // transaction now.
            if let Err(e) = tx.commit().await {
                // If commiting failed, we would like to retry a couple times, but for
                // now we just immediately reply 5xx.
                //
                // TODO: put all of this code in a loop and retry a couple times.
                error!("Failed to commit transaction for API request: {}", e);
                debug!("Request:\n{}", GqlReqPrinter(req));
                return Err(ExecuteError::Commit);
            };

            GraphQLResponse::from_result(Ok((value, vec![])))
        }
    };

    Ok(ExecuteOutput { response, num_queries })
}
