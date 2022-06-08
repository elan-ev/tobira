use hyper::{Body, Method, StatusCode};
use std::{
    mem,
    sync::Arc,
    time::Instant,
};

use crate::{api, auth::{self, AuthContext}, Config, db::{self, Transaction}, prelude::*};
use super::{Context, Request, Response, response};


/// This is the main HTTP entry point, called for each incoming request.
pub(super) async fn handle(req: Request<Body>, ctx: Arc<Context>) -> Response {
    trace!(
        "Incoming HTTP {:?} request to '{}'",
        req.method(),
        req.uri().path_and_query().map_or("", |pq| pq.as_str()),
    );

    let method = req.method().clone();
    let path = req.uri().path().trim_end_matches('/');

    const ASSET_PREFIX: &str = "/~assets/";

    match path {
        // Paths for which POST requests are allowed
        "/graphql" if method == Method::POST
            => handle_api(req, &ctx).await.unwrap_or_else(|r| r),
        "/~session" if method == Method::POST
            => auth::handle_login(req, &ctx).await.unwrap_or_else(|r| r),
        "/~session" if method == Method::DELETE
            => auth::handle_logout(req, &ctx).await,

        // From this point on, we only support GET and HEAD requests. All others
        // will result in 404.
        _ if method != Method::GET && method != Method::HEAD => {
            Response::builder()
                .status(StatusCode::METHOD_NOT_ALLOWED)
                .header("Content-Type", "text/plain; charset=UTF-8")
                .body(Body::from("405 Method not allowed"))
                .unwrap()
        }

        // Assets (JS files, fonts, ...)
        path if path.starts_with(ASSET_PREFIX) => {
            let asset_path = &path[ASSET_PREFIX.len()..];
            match ctx.assets.serve(asset_path).await {
                Some(r) => r,
                None => reply_404(&ctx, &method, path).await,
            }
        }


        // ----- Special, internal routes, starting with `/~` ----------------------------------
        "/.well-known/jwks.json" => {
            Response::builder()
                .header("Content-Type", "application/json")
                .body(Body::from(ctx.jwt.jwks().to_owned()))
                .unwrap()
        }

        // The interactive GraphQL API explorer/IDE. We actually keep this in
        // production as it does not hurt and in particular: does not expose any
        // information that isn't already exposed by the API itself.
        "/~graphiql" => juniper_hyper::graphiql("/graphql", None).await,

        // Listing all potential routes here is duplication of routing logic and not really
        // all that useful. So for now at least, we just assume all non-asset requests
        // to `/~*` are fine.
        path if path.starts_with("/~") => ctx.assets.serve_index(&ctx.config).await,


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
        _ => ctx.assets.serve_index(&ctx.config).await,
    }
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
    let html = ctx.assets.index().await;
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/html; charset=UTF-8")
        .with_content_security_policies(&ctx.config)
        .body(html)
        .unwrap()
}

/// Handles a request to `/graphql`.
async fn handle_api(req: Request<Body>, ctx: &Context) -> Result<Response, Response> {
    let before = Instant::now();

    // Get a connection for this request.
    let mut connection = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;

    // Get auth session
    let auth = match AuthContext::new(req.headers(), &ctx.config.auth, &connection).await {
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
    let out = juniper_hyper::graphql(ctx.api_root.clone(), api_context.clone(), req).await;

    // Get some values out of the context before dropping it
    let num_queries = api_context.db.num_queries();
    let has_errored = api_context.db.has_errored();
    let username = api_context.auth.debug_log_username();
    drop(api_context);

    // Check whether we own the last remaining handle of this Arc.
    let out = match Arc::try_unwrap(tx) {
        Err(_) => {
            // There are still other handles, meaning that the API handler
            // incorrectly stored the transaction in some static variable. This
            // is our fault and should NEVER happen. If it does happen, we
            // would have UB after this function exits. We can't have that. And
            // since panicking only brings down the current thread, we have to
            // reach for more drastic measures.
            error!("FATAL BUG: API handler kept reference to transaction. Ending process.");
            std::process::abort();
        }
        Ok(tx) => {
            if has_errored {
                error!("Error has occured during API DB transaction. Rolling back transaction...");
                if let Err(e) = tx.rollback().await {
                    error!("Failed to rollback transaction: {e}\nWill give up now. Transaction \
                        should be rolled back automatically since it won't be committed.");

                }

                return Ok(response::internal_server_error());
            }

            match tx.commit().await {
                // If the transaction succeeded we can return the generated response.
                Ok(_) => Ok(out),

                // Otherwise, we would like to retry a couple times, but for now
                // we just immediately reply 5xx.
                //
                // TODO: write `graphql_hyper` logic ourselves to be able to put
                // all of this code in a loop and retry a couple times.
                Err(e) => {
                    error!("Failed to commit transaction for API request: {}", e);
                    Err(response::service_unavailable())
                }
            }
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

/// Extension trait for response builder to add common headers.
pub(super) trait CommonHeadersExt {
    /// Sets the `Content-Security-Policy` header.
    fn with_content_security_policies(self, config: &Config) -> Self;
}

impl CommonHeadersExt for hyper::http::response::Builder {
    fn with_content_security_policies(self, config: &Config) -> Self {
        // Some comments about all relaxations:
        //
        // - `img` and `media` are loaded from Opencast. We know one URL host,
        //   but it's not guaranteed that the images are on that configured
        //   host. So we kind of have to allow any source.
        //
        // - `font-src` is similar: some might setup Tobira to load fonts from
        //   Google fonts or elsewhere.
        //
        // - `style-src` has to include `unsafe-inline` unfortunately. Our CSS
        //   lib, emotion-js, requires that. It does support setting a nonce
        //   for generated CSS, which we can also include in the CSP header.
        //   (TODO: investigate if that's worth it. I kind of doubt it if we
        //   use client side rendering).
        //
        //
        // TODO: check if configuring allowed hosts for `img-src`, `media-src`
        // and `font-src` is an option. Then again, admins can also
        // set/override those headers in their nginx?
        let upload_node = config.opencast.upload_node();
        let value = format!("\
            default-src 'none'; \
            img-src *; \
            media-src *; \
            font-src *; \
            script-src 'self'; \
            style-src 'self' 'unsafe-inline'; \
            connect-src 'self' {upload_node}; \
            form-action 'none'; \
        ");

        self.header("Content-Security-Policy", value)
    }
}
