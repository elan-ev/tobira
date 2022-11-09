use hyper::{Body, Method, StatusCode, http::HeaderValue, header};
use juniper::http::GraphQLRequest;
use std::{
    mem,
    sync::Arc,
    time::Instant,
};

use crate::{
    api,
    auth::{self, AuthContext},
    Config,
    db::{self, Transaction},
    metrics::HttpReqCategory,
    prelude::*,
};
use super::{Context, Request, Response, response};


/// This is the main HTTP entry point, called for each incoming request.
pub(super) async fn handle(req: Request<Body>, ctx: Arc<Context>) -> Response {
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
        "/~session" if method == Method::POST => {
            register_req!(HttpReqCategory::Login);
            auth::handle_login(req, &ctx).await.unwrap_or_else(|r| r)
        },
        "/~session" if method == Method::DELETE => {
            register_req!(HttpReqCategory::Logout);
            auth::handle_logout(req, &ctx).await
        },

        // From this point on, we only support GET and HEAD requests. All others
        // will result in 404.
        _ if method != Method::GET && method != Method::HEAD => {
            register_req!(HttpReqCategory::Other);

            // Do some helpful logging
            let note = if path == "/~login" {
                " (You have to configure your reverse proxy to handle login \
                    requests for you! These should never arrive at Tobira. Please \
                    see the docs about auth.)"
            } else {
                ""
            };
            debug!("Responding 405 Method not allowed to {method:?} {path} {note}");

            Response::builder()
                .status(StatusCode::METHOD_NOT_ALLOWED)
                .header("Content-Type", "text/plain; charset=UTF-8")
                .body(Body::from("405 Method not allowed"))
                .unwrap()
        }

        "/~metrics" => {
            register_req!(HttpReqCategory::Metrics);
            let out = ctx.metrics.gather_and_encode(&ctx.db_pool).await;
            Response::builder()
                .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
                .body(out.into())
                .unwrap()
        },

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
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body("Not found".into())
                .unwrap()
        }

        // ----- Special, internal routes, starting with `/~` ----------------------------------
        "/.well-known/jwks.json" => {
            register_req!(HttpReqCategory::Other);
            Response::builder()
                .header("Content-Type", "application/json")
                .body(Body::from(ctx.jwt.jwks().to_owned()))
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

/// Handles a request to `/graphql`. Method has to be POST.
async fn handle_api(req: Request<Body>, ctx: &Context) -> Result<Response, Response> {
    let before = Instant::now();

    // Parse request into juniper structure. This is done by `juniper_hyper`
    // too, but we do it manually to be able to inspect the request and to
    // retry running the query below. This assumes the method is POST.
    let (parts, body) = req.into_parts();

    // Make sure the content type is correct. We do not support `application/graphql`.
    if parts.headers.get(hyper::header::CONTENT_TYPE).map_or(true, |v| v != "application/json") {
        return Err(response::bad_request(Some("content type should be 'application/json'")));
    }

    // Download the full body. Responding with 400 if this fails is maybe not
    // correct, but when this fails there is likely a network problem and our
    // response won't ever be seen anyway.
    let raw_body = hyper::body::to_bytes(body).await.map_err(|e| {
        error!("Failed to download API request body: {e}");
        response::bad_request(None)
    })?;

    // Parse body as GraphQL request.
    let gql_request = serde_json::from_slice::<GraphQLRequest>(&raw_body).map_err(|e| {
        warn!("Failed to deserialize GraphQL request: {e}");
        response::bad_request(Some("invalid GraphQL request body"))
    })?;



    // Get a connection for this request.
    let mut connection = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;

    // Get auth session
    let auth = match AuthContext::new(&parts.headers, &ctx.config.auth, &connection).await {
        Ok(auth) => auth,
        Err(e) => {
            error!("DB error when checking user session: {}", e);
            return Err(response::internal_server_error());
        },
    };

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
    let connection = (); // Purposefully shadow to avoid accidentally accesing. See above.
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
    let gql_response = gql_request.execute(&ctx.api_root, &api_context).await;

    if !gql_response.is_ok() {
        warn!("API response is not OK");
        debug_graphql_req(&raw_body);
        if log::log_enabled!(log::Level::Debug) {
            let response = serde_json::to_string_pretty(&gql_response).unwrap();
            debug!("Response of failed API request: {response}");
        }
    }

    // Unfortunately, we have to convert the GQL response into an HTTP response
    // here already as otherwise `api_context` is borrowed. I am fairly sure
    // this is an API design error of juniper, but oh well. Not really a
    // problem for us either.
    //
    // TODO: see if this can be improved with Juniper 0.16
    let body = serde_json::to_string(&gql_response).unwrap();
    let out = Response::builder()
        .status(if gql_response.is_ok() { StatusCode::OK } else { StatusCode::BAD_REQUEST })
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.into())
        .unwrap();

    // Get some values out of the context before dropping it
    let num_queries = api_context.db.num_queries();
    let has_errored = api_context.db.has_errored();
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
        debug_graphql_req(&raw_body);
        std::process::abort();
    });

    // Check if any DB errors happened.
    if has_errored {
        error!("Errors have occured during API DB transaction. Rolling back transaction...");
        debug_graphql_req(&raw_body);
        if let Err(e) = tx.rollback().await {
            error!("Failed to rollback transaction: {e}\nWill give up now. Transaction \
                should be rolled back automatically since it won't be committed.");
        }

        return Ok(response::internal_server_error());
    }

    let out = match tx.commit().await {
        // If the transaction succeeded we can return the generated response.
        Ok(_) => Ok(out),

        // Otherwise, we would like to retry a couple times, but for now
        // we just immediately reply 5xx.
        //
        // TODO: put all of this code in a loop and retry a couple times.
        Err(e) => {
            error!("Failed to commit transaction for API request: {}", e);
            debug_graphql_req(&raw_body);
            Err(response::service_unavailable())
        }
    };

    debug!(
        "Finished /graphql query with {} SQL queries in {:.2?} (user: {})",
        num_queries,
        before.elapsed(),
        username,
    );

    out
}

fn debug_graphql_req(raw_body: &[u8]) {
    if log::log_enabled!(log::Level::Debug) {
        // We want to nicely print the request here. Unfortunately,
        // `GraphQLRequest` does not have an accessor for `query` and we don't
        // want to use its `Debug` impl as that would result in a very
        // unreadable `query`. So unfortunately, the best option is deserialize
        // the body again into our own structure.
        //
        // TODO: with juniper 0.16, the `query` and `variables` fields are
        // public, so use those.
        #[derive(serde::Deserialize)]
        struct DebugRequest {
            query: String,
            variables: Option<serde_json::Value>,
        }

        match serde_json::from_slice::<DebugRequest>(&raw_body) {
            Err(e) => warn!("Failed to deserialize response body for debug output: {e}"),
            Ok(req) => {
                debug!("Failed request query:\n{}", req.query);
                if let Some(vars) = req.variables {
                    debug!("Failed request variables: {vars:#?}");
                }
            }
        }
    }
}

/// Extension trait for response builder to add common headers.
pub(super) trait CommonHeadersExt {
    /// Sets the `Content-Security-Policy` header.
    fn with_content_security_policies(self, config: &Config, nonce: &str) -> Self;
}

impl CommonHeadersExt for hyper::http::response::Builder {
    fn with_content_security_policies(self, _config: &Config, _nonce: &str) -> Self {
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
        // TODO: check if configuring allowed hosts for `img-src`, `media-src`
        // and `font-src` is an option. Then again, admins can also
        // set/override those headers in their nginx?
        let value = format!("\
            default-src 'none'; \
            img-src *; \
            media-src * blob:; \
            font-src *; \
            script-src 'self'; \
            style-src 'self' 'unsafe-inline'; \
            connect-src *; \
            worker-src blob: 'self'; \
            form-action 'none'; \
        ");

        self.header("Content-Security-Policy", value)
    }
}

trait MakeNoindexExt {
    fn make_noindex(self, noindex: bool) -> Self;
}

impl MakeNoindexExt for hyper::Response<hyper::Body> {
    /// Adds the `x-robots-tag: noindex` header if `noindex` is true.
    fn make_noindex(mut self, noindex: bool) -> Self {
        if noindex {
            self.headers_mut().append("x-robots-tag", HeaderValue::from_static("noindex"));
        }
        self
    }
}
