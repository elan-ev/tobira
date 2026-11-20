use hyper::{
    body::Incoming,
    header,
    http::HeaderValue,
    Method, Request, StatusCode,
};
use juniper::http::GraphQLRequest;
use std::{
    collections::HashSet,
    sync::Arc,
    time::Instant,
};

use crate::{
    api,
    auth::{self, AuthContext, AuthState},
    db::{self, Transaction},
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
    super::log::req::log(&req);
    super::log::headers::log(&req);

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
            debug!(?method, path, "Responding 405 Method not allowed");
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
            handle_rss_request(req, &ctx).await.unwrap_or_else(|r| r)
        }

        // Assets (JS files, fonts, ...)
        path if path.starts_with(ASSET_PREFIX) => {
            register_req!(HttpReqCategory::Assets);
            let asset_path = &path[ASSET_PREFIX.len()..];
            match ctx.assets.serve(asset_path).await {
                Some(r) => r,
                None => response::not_found(),
            }
        }
        "/~sw.js" | "/~sw.map.js" => {
            register_req!(HttpReqCategory::Assets);
            let without_slash = &path[1..];
            ctx.assets.serve(without_slash).await.unwrap()
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
        "/~graphql-playground" => {
            register_req!(HttpReqCategory::Other);
            Response::builder()
                .header(header::CONTENT_TYPE, "text/html; charset=UTF-8")
                .body(juniper::http::playground::playground_source("/graphql", None).into())
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

async fn handle_rss_request(req: Request<Incoming>, ctx: &Arc<Context>) -> Result<Response, Response> {
    let db = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;
    let auth = AuthState::new(&req.headers(), &db, &ctx).await?;

    let path = req.uri().path();
    let rss_content = if let Some(series_id) = path.strip_prefix("/~rss/series/") {
        if let Some(redirect) = rss::redirect_opencast_id(&db, rss::RssResource::Series, series_id).await? {
            return Ok(redirect);
        }
        rss::generate_series_feed(&ctx, &auth, &db, series_id).await?
    } else if let Some(playlist_id) = path.strip_prefix("/~rss/playlist/") {
        if let Some(redirect) = rss::redirect_opencast_id(&db, rss::RssResource::Playlist, playlist_id).await? {
            return Ok(redirect);
        }
        rss::generate_playlist_feed(&ctx, &auth, &db, playlist_id).await?
    } else {
        return Ok(response::not_found());
    };

    Response::builder()
        .header("Content-Type", "application/rss+xml")
        .body(ByteBody::from(rss_content))
        .unwrap()
        .pipe(Ok)
}

/// Handles a request to `/graphql`. Method has to be POST.
async fn handle_api(req: Request<Incoming>, ctx: &Context) -> Result<Response, Response> {
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
    let gql_request = serde_json::from_slice::<GraphQLRequest>(&raw_body).map_err(|e| {
        warn!("Failed to deserialize GraphQL request: {e}");
        response::bad_request("invalid GraphQL request body")
    })?;



    // Get a connection for this request.
    let before_conn = Instant::now();
    let connection = db::get_conn_or_service_unavailable(&ctx.db_pool).await?;

    // Get auth session
    let before_auth = Instant::now();
    let auth = AuthState::new(&parts.headers, &connection, &ctx).await?;
    let username = auth.debug_log_username();

    let before_exec = Instant::now();
    let tx = match Transaction::begin(connection).await {
        Ok(tx) => tx,
        Err(e) => {
            error!("Failed to start transaction for API request: {}", e);
            return Err(response::internal_server_error());
        }
    };

    let api_context = api::Context {
        db: tx,
        auth: AuthContext {
            state: auth,
            config: ctx.config.auth.clone(),
        },
        config: ctx.config.clone(),
        jwt: ctx.jwt.clone(),
        search: ctx.search.clone(),
        oc_client: ctx.oc_client.clone(),
    };
    let output = api::execute(&ctx.api_root, api_context, &gql_request).await
        .map_err(|e| match e {
            api::ExecuteError::InvalidRequest(e) => {
                response::bad_request(format!("bad GraphQL request: {e}"))
            }
            api::ExecuteError::Commit => response::service_unavailable(),
        })?;
    let exec_time = before_exec.elapsed();

    // Create an appropriate HTTP response.
    let body = serde_json::to_string(&output.response).unwrap();
    let out = Response::builder()
        .status(if output.response.is_ok() { StatusCode::OK } else { StatusCode::BAD_REQUEST })
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.into())
        .unwrap();

    trace!(
        "Finished /graphql query for user '{}' with {} SQL queries in {:.2?} \
            (DB conn {:.2?}, auth {:.2?}, exec {:.2?})",
        username,
        output.num_queries,
        before.elapsed(),
        before_auth - before_conn,
        before_exec - before_auth,
        exec_time,
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
                .map(|url| url.with_path("/redirect/get").to_string())
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
