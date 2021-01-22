use std::collections::HashMap;

use hyper::Body;
use reinda::{assets, Config, Setup};

use tobira_util::prelude::*;
use crate::config;
use super::Response;


const ASSETS: Setup = assets! {
    #![base_path = "../../frontend/build"]

    "index.html": { template },
    "bundle.js": {
        template,
        hash,
        append: b"//# sourceMappingURL=/assets/{{: path:bundle.js.map :}}"
    },
    "bundle.js.map": { hash },

    "logo-large.svg": { hash, dynamic },
    "logo-small.svg": { hash, dynamic },

    "fonts.css": {
        template,
        serve: false,
    },

    // Font files
    "fonts/cyrillic-400.woff2": { hash },
    "fonts/cyrillic-700.woff2": { hash },
    "fonts/cyrillic-ext-400.woff2": { hash },
    "fonts/cyrillic-ext-700.woff2": { hash },
    "fonts/cyrillic-ext-i400.woff2": { hash },
    "fonts/cyrillic-ext-i700.woff2": { hash },
    "fonts/cyrillic-i400.woff2": { hash },
    "fonts/cyrillic-i700.woff2": { hash },
    "fonts/greek-400.woff2": { hash },
    "fonts/greek-700.woff2": { hash },
    "fonts/greek-ext-400.woff2": { hash },
    "fonts/greek-ext-700.woff2": { hash },
    "fonts/greek-ext-i400.woff2": { hash },
    "fonts/greek-ext-i700.woff2": { hash },
    "fonts/greek-i400.woff2": { hash },
    "fonts/greek-i700.woff2": { hash },
    "fonts/latin-400.woff2": { hash },
    "fonts/latin-700.woff2": { hash },
    "fonts/latin-ext-400.woff2": { hash },
    "fonts/latin-ext-700.woff2": { hash },
    "fonts/latin-ext-i400.woff2": { hash },
    "fonts/latin-ext-i700.woff2": { hash },
    "fonts/latin-i400.woff2": { hash },
    "fonts/latin-i700.woff2": { hash },
    "fonts/vietnamese-400.woff2": { hash },
    "fonts/vietnamese-700.woff2": { hash },
    "fonts/vietnamese-i400.woff2": { hash },
    "fonts/vietnamese-i700.woff2": { hash },
};

const INDEX_FILE: &str = "index.html";

pub(crate) struct Assets {
    assets: reinda::Assets,

    // TODO: this is temporary until we update hyper to tokio 1.0. We need to
    // explicitly store the runtime here to use the tokio 1.0 runtime inside of
    // the handler functions as those are called within the hyper handler, which
    // is a tokio 0.2 runtime.
    runtime: tokio::runtime::Handle,
}

impl Assets {
    pub(crate) async fn init(config: &config::Assets) -> Result<Self> {
        // TODO: temporary
        let runtime = tokio::runtime::Handle::current();

        let mut path_overrides = HashMap::new();
        path_overrides.insert("logo-large.svg".into(), config.logo.large.clone());
        path_overrides.insert("logo-small.svg".into(), config.logo.small.clone());

        let config = Config {
            base_path: Some(config.internal.clone()),
            path_overrides,
            .. Config::default()
        };

        let assets = reinda::Assets::new(ASSETS, config).await
            .context("failed to prepare asset files")?;
        info!("Prepared {} assets", assets.asset_ids().count());

        Ok(Self { assets, runtime } )
    }

    /// Responds with the asset identified by the given path. If there exists no
    /// asset with `path` or `path` is `INDEX_FILE`, `None` is returned.
    pub(crate) async fn serve(&self, path: &str) -> Option<Response> {
        // The `index.html` here is not intended to be served directly. It is
        // modified and sent on many other routes.
        if path == INDEX_FILE {
            return None;
        }

        // TODO: temporary
        let _guard = self.runtime.enter();
        let data = self.assets.get(path).await.unwrap_or_else(|e| {
            panic!("failed to read asset '{}': {}", path, e);
        })?;
        let mime_guess = mime_guess::from_path(path).first();
        let mut builder = Response::builder();
        if let Some(mime) = mime_guess {
            builder = builder.header("Content-Type", mime.to_string())
        }

        // TODO: content length
        // TODO: lots of other headers maybe

        // TODO: here we copy the asset in memory, which is very unfortunate. We
        // can fix this by removing `to_vec` as soon as we update hyper to 0.14.
        let body = Body::from(data.to_vec());
        Some(builder.body(body).expect("bug: invalid response"))
    }

    pub(crate) async fn index(&self) -> Body {
        // TODO: temporary
        let _guard = self.runtime.enter();

        // We treat the `index.html` missing as internal server error. We are
        // not a general file server. We require this index file to function.
        self.assets.get(INDEX_FILE).await
            .expect("failed to read 'index.html'")
            .expect("`index.html` missing in internal assets")
            .to_vec()  // TODO: remove this copy once we update to hyper 0.14
            .into()
    }

    /// Serves the main entry point of the application. This is replied to `/` and
    /// other "public routes", like `/r/lectures`. Basically everywhere where the
    /// user is supposed to see the website.
    pub(crate) async fn serve_index(&self) -> Response {
        let html = self.index().await;

        // TODO: include useful data into the HTML file

        let mut builder = Response::builder();
        builder = builder.header("Content-Type", "text/html; charset=UTF-8");

        // TODO: content length
        // TODO: lots of other headers maybe

        builder.body(html).expect("bug: invalid response")
    }
}
