use goose::prelude::*;


#[tokio::main]
async fn main() -> Result<(), GooseError> {
    GooseAttack::initialize()?
        .register_scenario(scenario!("Index HTML")
            .register_transaction(transaction!(loadtest_index))
        )
        .register_scenario(scenario!("Index GraphQL")
            .register_transaction(transaction!(loadtest_index_graphql))
        )
        .register_scenario(scenario!("Video GraphQL")
            .register_transaction(transaction!(loadtest_video_graphql))
        )
        .register_scenario(scenario!("Single event JWT")
            .register_transaction(transaction!(loadtest_single_jwt))
        )
        .register_scenario(scenario!("Multi event JWTs")
            .register_transaction(transaction!(loadtest_multi_jwt))
        )
        .execute()
        .await?;

    Ok(())
}


async fn loadtest_index(user: &mut GooseUser) -> TransactionResult {
    let _goose_metrics = user.get("").await?;

    Ok(())
}

async fn loadtest_index_graphql(user: &mut GooseUser) -> TransactionResult {
    send_gql_request(user, GQL_QUERY_INDEX).await
}

async fn loadtest_video_graphql(user: &mut GooseUser) -> TransactionResult {
    send_gql_request(user, GQL_QUERY_VIDEO).await
}

async fn loadtest_single_jwt(user: &mut GooseUser) -> TransactionResult {
    send_gql_request(user, GQL_QUERY_SINGLE_JWT).await
}

async fn loadtest_multi_jwt(user: &mut GooseUser) -> TransactionResult {
    send_gql_request(user, GQL_QUERY_MUTLI_JWT).await
}

async fn send_gql_request(user: &mut GooseUser, body: &'static str) -> TransactionResult {
    let request_builder = user.get_request_builder(&GooseMethod::Post, "graphql")?
        .body(body)
        .header("Content-Type", "application/json");
    let request = GooseRequest::builder()
        .set_request_builder(request_builder)
        .build();
    let _ = user.request(request).await?;

    Ok(())
}

const GQL_QUERY_INDEX: &str = include_str!("gql_index.json");
const GQL_QUERY_VIDEO: &str = include_str!("gql_video.json");
const GQL_QUERY_SINGLE_JWT: &str = include_str!("gql_single_jwt.json");
const GQL_QUERY_MUTLI_JWT: &str = include_str!("gql_multi_jwt.json");
