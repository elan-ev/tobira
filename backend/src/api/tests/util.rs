//! Helpers for testing the GraphQL API.

use std::{borrow::Borrow, sync::Arc};
use assert_json_diff::assert_json_eq;
use juniper::{http::GraphQLRequest, InputValue};
use serde_json::Value;

use crate::{
    api::{self, ExecuteError, RootNode},
    auth::{AuthContext, AuthState, JwtContext, User},
    config::Config,
    db::Transaction,
    prelude::*,
    search,
    sync::OcClient,
    testing::db::TestDb,
};


// The following users are the same as in our dummy login (`util/dummy-login`),
// which is used in the dev environment and on test deployments.

/// Test user `admin` ("Administrator") with roles `ROLE_ADMIN` and
/// `ROLE_SUDO`.
pub(crate) const ADMIN: TestUser = TestUser {
    username: "admin",
    display_name: "Administrator",
    roles: &["ROLE_ADMIN", "ROLE_SUDO"],
};

/// Test user `sabine` ("Sabine Rudolfs") with roles `ROLE_INSTRUCTOR`,
/// `ROLE_STAFF`, `ROLE_TOBIRA_CAN_FIND_UNLISTED`, `ROLE_TOBIRA_UPLOAD`,
/// `ROLE_TOBIRA_STUDIO` and `ROLE_TOBIRA_CAN_CREATE_SERIES`.
pub(crate) const SABINE_INSTRUCTOR: TestUser = TestUser {
    username: "sabine",
    display_name: "Sabine Rudolfs",
    roles: &[
        "ROLE_INSTRUCTOR",
        "ROLE_STAFF",
        "ROLE_TOBIRA_CAN_FIND_UNLISTED",
        "ROLE_TOBIRA_UPLOAD",
        "ROLE_TOBIRA_STUDIO",
        "ROLE_TOBIRA_CAN_CREATE_SERIES",
    ],
};

/// Test user `jose` ("José Carreño Quiñones") with role `ROLE_STUDENT`.
pub(crate) const JOSE_STUDENT: TestUser = TestUser {
    username: "jose",
    display_name: "José Carreño Quiñones",
    roles: &["ROLE_STUDENT"],
};

/// A logged-in user for tests. Common users are defined as constants above.
#[derive(Clone)]
pub(crate) struct TestUser {
    pub(crate) username: &'static str,
    pub(crate) display_name: &'static str,

    /// Roles of this user. The user role (see [`Self::user_role`]),
    /// `ROLE_ANONYMOUS` and `ROLE_USER` are added automatically.
    pub(crate) roles: &'static [&'static str],
}

impl TestUser {
    /// The user role, e.g. `ROLE_USER_JOSE` for `jose`.
    pub(crate) fn user_role(&self) -> String {
        format!("ROLE_USER_{}", self.username.to_uppercase())
    }

    pub(crate) fn auth_state(&self) -> AuthState {
        let user_role = self.user_role();
        let mut user = User {
            username: self.username.into(),
            display_name: self.display_name.into(),
            email: None,
            roles: self.roles.iter()
                .map(|r| r.to_string())
                .chain([user_role.clone()])
                .collect(),
            user_role,
            user_realm_handle: None,
        };
        user.add_default_roles();
        AuthState::User(user)
    }
}


/// Everything required to run GraphQL requests against the API: a fresh
/// temporary DB plus all other parts of the API context. Every request gets
/// its own context and DB transaction, like in production.
pub(crate) struct TestApi {
    /// The test DB, e.g. to add data before running requests.
    pub(crate) db: TestDb,

    root: RootNode,
    config: Arc<Config>,
    jwt: Arc<JwtContext>,
    search: Arc<search::Client>,
    oc_client: Arc<OcClient>,
}

impl TestApi {
    pub(crate) async fn new() -> Result<Self> {
        // Done in `main` in production. Required for creating HTTP clients.
        // Fails if another test already installed it, which is fine.
        let _ = rustls::crypto::ring::default_provider().install_default();

        let config = test_config()?;
        Ok(Self {
            db: TestDb::with_migrations().await?,
            root: api::root_node(),
            jwt: Arc::new(JwtContext::new(&config.auth.jwt)?),
            search: Arc::new(search::Client::new(config.meili.clone())?),
            oc_client: Arc::new(OcClient::new(&config)?),
            config: Arc::new(config),
        })
    }

    /// Prepares a request with the given query. By default, it is sent by an
    /// anonymous user without variables.
    pub(crate) fn query(&self, query: impl Into<String>) -> Query<'_> {
        Query { api: self, query: query.into(), user: None, vars: None }
    }
}

/// A prepared GraphQL request, sent with [`Query::run`].
pub(crate) struct Query<'a> {
    api: &'a TestApi,
    query: String,
    user: Option<TestUser>,
    vars: Option<Value>,
}

impl Query<'_> {
    /// Sends the request as the given user instead of an anonymous one.
    pub(crate) fn as_user(mut self, user: &TestUser) -> Self {
        self.user = Some(user.clone());
        self
    }

    /// Sets the GraphQL variables, e.g. `json!({ "id": "foo" })`. Accepts
    /// owned values and references.
    pub(crate) fn vars(mut self, vars: impl Borrow<Value>) -> Self {
        self.vars = Some(vars.borrow().clone());
        self
    }

    /// Executes the request. Returns `Err` only if the request could not be
    /// executed at all, e.g. invalid syntax. GraphQL errors are part of the
    /// response.
    pub(crate) async fn run(self) -> Result<Response> {
        let api = self.api;
        let vars = self.vars.map(serde_json::from_value::<InputValue>).transpose()?;
        let request = GraphQLRequest::new(self.query, None, vars);
        let context = api::Context {
            db: Transaction::begin(api.db.get_conn().await?).await?,
            auth: AuthContext {
                state: self.user.map_or(AuthState::Anonymous, |u| u.auth_state()),
                config: api.config.auth.clone(),
            },
            config: api.config.clone(),
            jwt: api.jwt.clone(),
            search: api.search.clone(),
            oc_client: api.oc_client.clone(),
        };

        let output = api::execute(&api.root, context, &request).await
            .map_err(|e| match e {
                ExecuteError::InvalidRequest(e) => anyhow!("invalid GraphQL request: {e}"),
                ExecuteError::Commit => anyhow!("failed to commit DB transaction"),
            })?;

        let mut json = serde_json::to_value(&output.response)?;
        Ok(Response {
            data: json.get_mut("data").map(Value::take).unwrap_or(Value::Null),
            errors: match json.get_mut("errors").map(Value::take) {
                Some(Value::Array(errors)) => errors,
                _ => vec![],
            },
        })
    }
}

/// The response to a GraphQL request.
#[derive(Debug)]
pub(crate) struct Response {
    /// The `data` field, `null` if there is none.
    pub(crate) data: Value,

    /// The `errors` field, empty if there is none.
    pub(crate) errors: Vec<Value>,
}

impl Response {
    /// Asserts that there are no errors and that `data` equals `expected`.
    /// The order of object fields does not matter.
    #[track_caller]
    pub(crate) fn assert_ok(&self, expected: Value) {
        self.assert_no_errors();
        assert_json_eq!(&self.data, &expected);
    }

    #[track_caller]
    pub(crate) fn assert_no_errors(&self) {
        if !self.errors.is_empty() {
            let errors = serde_json::to_string_pretty(&self.errors).unwrap();
            panic!("expected no errors, but got: {errors}");
        }
    }
}


/// Minimal config, only containing values that have no default. These dummy
/// values are not relevant for the API: no files are read and nothing is
/// contacted when creating the context. They are obviously fake, so that it
/// is apparent if they ever show up somewhere. The `.invalid` TLD never
/// resolves, so contacting those hosts fails immediately.
fn test_config() -> Result<Config> {
    let config = confique::config!(Config {
        general: {
            site_title: { "default": "TEST SITE TITLE" },
            tobira_url: "https://DUMMY.invalid",
        },
        db: {
            password: "DUMMY",
        },
        opencast: {
            host: "https://DUMMY.invalid",
            user: "DUMMY",
            password: "DUMMY",
        },
        meili: {
            key: "DUMMY",
        },
        theme: {
            favicon: "DUMMY.svg",
            logos: [{ "path": "DUMMY.svg", "resolution": [1, 1] }],
        },
    })?;
    Ok(config)
}
