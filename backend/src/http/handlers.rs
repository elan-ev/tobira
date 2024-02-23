use hyper::{
    body::Incoming,
    header,
    http::{uri::PathAndQuery, HeaderValue},
    Method, Request, StatusCode, Uri,
};
use juniper::{http::GraphQLResponse, graphql_value};
use std::{
    collections::HashSet,
    fmt,
    mem,
    sync::Arc,
    time::Instant,
};

use crate::{
    api,
    auth::{self, AuthContext},
    db::{self, Transaction},
    http::response::bad_request,
    metrics::HttpReqCategory,
    prelude::*,
    rss,
    util::{download_body, ByteBody},
    Config,
};
use super::{Context, Response, response};


/// This is the main HTTP entry point, called for each incoming request.
pub(super) async fn handle(req: Request<Incoming>, ctx: Arc<Context>) -> Response {
    let time_incoming = Instant::now();
    trace!(
        "Incoming HTTP {:?} request to '{}'",
        req.method(),
        req.uri().path_and_query().map_or("", |pq| pq.as_str()),
    );
    if ctx.config.log.log_http_headers {
        let mut out = String::new();
        for (name, value) in req.headers() {
            use std::fmt::Write;
            write!(out, "\n  {}: {}", name, String::from_utf8_lossy(value.as_bytes())).unwrap();
        }
        trace!("HTTP Headers: {}", out);
    }

    let method = req.method().clone();
    let path = req.uri().path().trim_end_matches('/');

    const ASSET_PREFIX: &str = "/~assets/";

    let category;
    macro_rules! register_req {
        ($category:expr) => {
            ctx.metrics.register_http_req($category);
            category = $category;
        };
    }

    let response = match path {
        // Paths for which POST requests are allowed
        "/graphql" if method == Method::POST => {
            register_req!(HttpReqCategory::GraphQL);
            handle_api(req, &ctx).await.unwrap_or_else(|r| r)
        },
        "/~login" if method == Method::POST => {
            register_req!(HttpReqCategory::Login);
            auth::handle_post_login(req, &ctx).await
        },
        "/~session" if method == Method::POST => {
            register_req!(HttpReqCategory::Login);
            auth::handle_post_session(req, &ctx).await.unwrap_or_else(|r| r)
        },
        "/~session" if method == Method::DELETE => {
            register_req!(HttpReqCategory::Logout);
            auth::handle_delete_session(req, &ctx).await
        },

        // From this point on, we only support GET and HEAD requests. All others
        // will result in 404.
        _ if method != Method::GET && method != Method::HEAD => {
            register_req!(HttpReqCategory::Other);
            debug!("Responding 405 Method not allowed to {method:?} {path}");
            Response::builder()
                .status(StatusCode::METHOD_NOT_ALLOWED)
                .header("Content-Type", "text/plain; charset=UTF-8")
                .body(ByteBody::new("405 Method not allowed".into()))
                .unwrap()
        }

        "/~metrics" => {
            register_req!(HttpReqCategory::Metrics);
            let out = ctx.metrics.gather_and_encode(&ctx).await;
            Response::builder()
                .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
                .body(out.into())
                .unwrap()
        },

        path if path.starts_with("/~rss") => {
            register_req!(HttpReqCategory::Other);
            handle_rss_request(path, &ctx).await.unwrap_or_else(|r| r)
        }

        // Assets (JS files, fonts, ...)
        path if path.starts_with(ASSET_PREFIX) => {
            register_req!(HttpReqCategory::Assets);
            let asset_path = &path[ASSET_PREFIX.len()..];
            match ctx.assets.serve(asset_path).await {
                Some(r) => r,
                None => reply_404(&ctx, &method, path).await,
            }
        }

        // Some browser automatically request this in certain situations. As we
        // serve our favicon differently, it's best to reply 404 here
        // (and without our frontend!).
        "/favicon.ico" => {
            register_req!(HttpReqCategory::Other);
            response::not_found()
        }

        // ----- Special, internal routes, starting with `/~` ----------------------------------
        "/.well-known/jwks.json" => {
            register_req!(HttpReqCategory::Other);
            Response::builder()
                .header("Content-Type", "application/json")
                .body(ByteBody::new(ctx.jwt.jwks().clone()))
                .unwrap()
        }

        // The interactive GraphQL API explorer/IDE. We actually keep this in
        // production as it does not hurt and in particular: does not expose any
        // information that isn't already exposed by the API itself.
        "/~graphiql" => {
            register_req!(HttpReqCategory::Other);
            Response::builder()
                .header(header::CONTENT_TYPE, "text/html; charset=UTF-8")
                .body(juniper::http::graphiql::graphiql_source("/graphql", None).into())
                .unwrap()
        },

        // Currently we just reply with our `index.html` to everything else.
        // That's of course not optimal because for many paths, our frontend
        // will show 404. It would be nice to reply 404 from the server
        // instead. But in order to do that, we would have to duplicate some
        // logic here. And since then we need to do a database lookup anyway,
        // we should probably already use that data and include it in the
        // `index.html`.
        //
        // I think doing all that is a good idea as soon as our routing logic is
        // fixed and doesn't change anymore. But for now, we avoid the
        // duplicate logic. So yeah:
        //
        // TODO: fix that at some point ^
        _ => {
            register_req!(HttpReqCategory::App);
            let noindex = path.starts_with("/!")
                || (path.starts_with("/~") && !path.starts_with("/~about"));

            ctx.assets
                .serve_index(StatusCode::OK, &ctx.config)
                .await
                .make_noindex(noindex)
        }
    };
    
    let response_time = time_incoming.elapsed();
    ctx.metrics.observe_response_time(category, response_time);
    response
}

/// Replies with a 404 Not Found.
pub(super) async fn reply_404(ctx: &Context, method: &Method, path: &str) -> Response {
    debug!("Responding with 404 to {:?} '{}'", method, path);

    // We simply send the normal index and let the frontend router determinate
    // this is a 404. That way, our 404 page looks like the main page and users
    // are not confused. And it's easier to return to the normal page.
    //
    // TODO: I am somewhat uneasy about this code assuming the router of the
    // frontend is the same as the backend router. Maybe we want to indicate to
    // the frontend explicitly to show a 404 page? However, without redirecting
    // to like `/404` because that's annoying for users.
    ctx.assets.serve_index(StatusCode::NOT_FOUND, &ctx.config).await
}

async fn handle_rss_request(path: &str, ctx: &Arc<Context>) -> Result<Response, Response> {
    let Some(series_id) = path.strip_prefix("/~rss/series/") else {
        return Ok(response::not_found());
    };

    rss::generate_feed(&ctx, series_id).await.map(|rss_content| {
        Response::builder()
            .header("Content-Type", "application/rss+xml")
            .body(ByteBody::from(rss_content))
            .unwrap()
    })
}

/// Handles a request to `/graphql`. Method has to be POST.
async fn handle_api(req: Request<Incoming>, ctx: &Context) -> Result<Response, Response> {
    // TODO: With Juniper 0.16, this function can likely be simplified!

    /// This is basically `juniper::http::GraphQLRequest`. We unfortunately have
    /// to duplicate it here to get access to the fields (which are private in
    /// Juniper 0.15).
    #[derive(serde::Deserialize)]
    struct GraphQLReq {
        query: String,
        variables: Option<juniper::InputValue>,
        #[serde(rename = "operationName")]
        operation_name: Option<String>,
    }

    impl GraphQLReq {
        fn variables(&self) -> juniper::Variables {
            self.variables
                .as_ref()
                .and_then(|iv| {
                    iv.to_object_value().map(|o| {
                        o.into_iter()
                            .map(|(k, v)| (k.to_owned(), v.clone()))
                            .collect()
                    })
                })
                .unwrap_or_default()
        }
    }

    impl fmt::Display for GraphQLReq {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            writeln!(f, "Query:\n{}", self.query)?;
            writeln!(f, "Operation name: {:?}", self.operation_name)?;
            writeln!(f, "Variables: {}", serde_json::to_string_pretty(&self.variables).unwrap())?;
            Ok(())
        }
    }


    let before = Instant::now();

    // Parse request into a structure that Juniper can understand. This is done
    // by `juniper_hyper` too, but we do it manually to be able to inspect the
    // request and to retry running the query below. This assumes the method is
    // POST.
    let (parts, body) = req.into_parts();

    // Make sure the content type is correct. We do not support `application/graphql`.
    if parts.headers.get(hyper::header::CONTENT_TYPE).map_or(true, |v| v != "application/json") {
        return Err(response::bad_request("content type should be 'application/json'"));
    }

    // Download the full body. Responding with 400 if this fails is maybe not
    // correct, but when this fails there is likely a network problem and our
    // response won't ever be seen anyway.
    let raw_body = download_body(body).await.map_err(|e| {
        error!("Failed to download API request body: {e}");
        response::bad_request("")
    })?;

    // Parse body as GraphQL request.
    let gql_request = serde_json::from_slice::<GraphQLReq>(&raw_body).map_err(|e| {
        warn!("Failed to deserialize GraphQL request: {e}");
        response::bad_request("invalid GraphQL request body")
    })?;



    // Get a connection for this request.
    let mut connection = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;

    // Get auth session
    let auth = AuthContext::new(&parts.headers, &connection, &ctx).await?;

    let tx = match connection.transaction().await {
        Ok(tx) => tx,
        Err(e) => {
            error!("Failed to start transaction for API request: {}", e);
            return Err(response::internal_server_error());
        }
    };

    // Okay, lets take a deep breath.
    //
    // Unfortunately, `juniper` does not support contexts with a lifetime
    // parameter. However, we'd like to have one SQL transaction per API
    // request. The transaction type (`deadpool_postgres::Transaction`) borrows
    // from the DB connection (`tokio_postgres::Client`) and thus has a
    // lifetime parameter. This makes sense for the API of that library since
    // it statically prevents a number of logic bugs. But it is inconvenient
    // for us.
    //
    // Unfortunately, we think the best solution for us is to use `unsafe` here
    // to just get rid of the lifetime parameter. We can pretend that the
    // lifetime is `'static`. Of course, we then have to make sure that the
    // transaction does not outlive the borrowed connection. We do that by
    // putting the transaction into an `Arc`. That way we can check whether
    // there still exists a reference after calling the API handlers. The
    // transaction is not `Clone` and `Arc` only gives an immutable reference
    // to the underlying value. So even a buggy handler could not move the
    // transaction out of the `Arc`.
    //
    // Unfortunately, `connection` is not treated as borrowed after this unsafe
    // block. So we must make sure not to access it at all until we get rid of
    // the transaction (by committing it below).
    type PgTx<'a> = deadpool_postgres::Transaction<'a>;
    #[allow(unused_variables)]
    let connection = (); // Purposefully shadow to avoid accidentally accessing. See above.
    let tx = unsafe {
        let static_tx = mem::transmute::<PgTx<'_>, PgTx<'static>>(tx);
        Arc::new(static_tx)
    };

    let api_context = Arc::new(api::Context {
        db: Transaction::new(tx.clone()),
        auth,
        config: ctx.config.clone(),
        jwt: ctx.jwt.clone(),
        search: ctx.search.clone(),
    });
    let gql_result = juniper::execute(
        &gql_request.query,
        gql_request.operation_name.as_deref(),
        &ctx.api_root,
        &gql_request.variables(),
        &api_context,
    ).await;

    // Get some values out of the context before dropping it
    let num_queries = api_context.db.num_queries();
    let username = api_context.auth.debug_log_username();
    drop(api_context);

    // Check whether we own the last remaining handle of this Arc.
    let tx = Arc::try_unwrap(tx).unwrap_or_else(|_| {
        // There are still other handles, meaning that the API handler
        // incorrectly stored the transaction in some static variable. This
        // is our fault and should NEVER happen. If it does happen, we
        // would have UB after this function exits. We can't have that. And
        // since panicking only brings down the current thread, we have to
        // reach for more drastic measures.
        error!("FATAL BUG: API handler kept reference to transaction. Ending process.");
        debug!("Request:\n{gql_request}");
        std::process::abort();
    });


    // Check if any errors occured.
    macro_rules! log_and_rollback {
        () => {
            debug!("Failed request:\n{gql_request}");
            debug!("Rolling back DB transaction...");
            if let Err(e) = tx.rollback().await {
                error!("Failed to rollback transaction: {e}\nWill give up now. Transaction \
                    should be rolled back automatically since it won't be committed.");
            }
        };
    }

    let gql_response = match gql_result {
        Err(e) => {
            // This kind of error only seems to happen when there is something
            // wrong with the request. It's unlikely that any SQL queries have
            // been executed, but we roll back the transaction anyway.
            warn!("GraphQL request error: {e}");
            log_and_rollback!();
            return Err(bad_request(format!("bad GraphQL request: {e}")));
        }

        Ok((value, errors)) if !errors.is_empty() => {
            let error_to_msg = |e: &juniper::ExecutionError<juniper::DefaultScalarValue>| {
                // Uh oh: `message` is a `#[doc(hidden)]` method, which usually
                // means that the library authors only need it public for macro
                // purposes and that its not actually part of the public API
                // that is evolved through semver. But: lots of things in
                // Juniper are weird, so this doesn't necessarily have any
                // intent behind it. Also, we can always get at the same data
                // by serializing this error as JSON and poking it out like
                // that. Using the method is just easier. If the method is ever
                // removed, we have to use the JSON solution. But I'm very sure
                // it won't be removed in 0.15.x anymore.
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
                debug!("Request:\n{gql_request}");
                return Err(response::service_unavailable());
            };

            GraphQLResponse::from_result(Ok((value, vec![])))
        }
    };

    // Create an appropriate HTTP response.
    let body = serde_json::to_string(&gql_response).unwrap();
    let out = Response::builder()
        .status(if gql_response.is_ok() { StatusCode::OK } else { StatusCode::BAD_REQUEST })
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.into())
        .unwrap();

    trace!(
        "Finished /graphql query with {} SQL queries in {:.2?} (user: {})",
        num_queries,
        before.elapsed(),
        username,
    );

    Ok(out)
}

/// Extension trait for response builder to add common headers.
pub(super) trait CommonHeadersExt {
    /// Sets the `Content-Security-Policy` header.
    fn with_content_security_policies(self, config: &Config, nonce: &str) -> Self;
}

impl CommonHeadersExt for hyper::http::response::Builder {
    fn with_content_security_policies(self, config: &Config, nonce: &str) -> Self {
        let redirect_actions = if config.auth.pre_auth_external_links {
            [config.opencast.studio_url(), config.opencast.editor_url()]
                .into_iter()
                .map(|uri| {
                    let mut parts = uri.0.into_parts();
                    parts.path_and_query = Some(PathAndQuery::from_static("/redirect/get"));
                    Uri::from_parts(parts).unwrap().to_string()
                })
                .collect::<HashSet<_>>()
                .into_iter()
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            "'none'".into()
        };

        // TODO: when this is fixed, use `format_args!` to avoid the useless
        // space in the None case below.
        // https://github.com/rust-lang/rust/issues/92698
        let matomo_url = match &config.matomo.server {
            Some(server) => server as &dyn std::fmt::Display,
            None => &"",
        };

        // Some comments about all relaxations:
        //
        // - `img` and `media` are loaded from Opencast. We know one URL host,
        //   but it's not guaranteed that the images are on that configured
        //   host. So we kind of have to allow any source. For live streams via
        //   hls.js, we need to allow `blob:` sources too.
        //
        // - `font-src` is similar: some might setup Tobira to load fonts from
        //   Google fonts or elsewhere.
        //
        // - `style-src` has to include `unsafe-inline` due to Paella player
        //   emitting inline CSS. Our CSS lib, emotion-js, uses inline CSS, but
        //   it allows passing it a nonce. Everything is prepared to use that
        //   `nonce` system, but we can't include 'nonce-123' in the CSP header
        //   as then browsers will disregard the 'unsafe-inline'. We hope to
        //   remove 'unsafe-inline' once this is fixed:
        //   https://github.com/polimediaupv/paella-core/issues/74
        //
        // - `connect-src` unfortunately has to be `*` right now due to live
        //   streams. Loading the m3u8 file is done via a JS fetch, and since
        //   we don't know where these m3u8 files live, we have to allow
        //   everything here.
        //
        // - `form-actions` are needed for the JWT-based pre-authentication to work.
        //
        // TODO: check if configuring allowed hosts for `img-src`, `media-src`
        // and `font-src` is an option. Then again, admins can also
        // set/override those headers in their nginx?
        let value = format!("\
            default-src 'none'; \
            img-src *; \
            media-src * blob:; \
            font-src *; \
            script-src 'self' 'nonce-{nonce}' {matomo_url}; \
            style-src 'self' 'unsafe-inline'; \
            connect-src *; \
            worker-src blob: 'self'; \
            form-action {redirect_actions}; \
        ");

        self.header("Content-Security-Policy", value)
    }
}

trait MakeNoindexExt {
    fn make_noindex(self, noindex: bool) -> Self;
}

impl MakeNoindexExt for Response {
    /// Adds the `x-robots-tag: noindex` header if `noindex` is true.
    fn make_noindex(mut self, noindex: bool) -> Self {
        if noindex {
            self.headers_mut().append("x-robots-tag", HeaderValue::from_static("noindex"));
        }
        self
    }
}
