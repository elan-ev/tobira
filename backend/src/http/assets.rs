use std::collections::HashMap;

use hyper::Body;
use reinda::{assets, Setup};
use serde_json::json;

use crate::{config::Config, prelude::*, theme::ThemeConfig};
use super::Response;


const ASSETS: Setup = assets! {
    #![base_path = "../frontend/build"]

    "index.html": { template },
    "bundle.js": {
        template,
        hash,
        append: b"//# sourceMappingURL=/~assets/{{: path:bundle.js.map :}}"
    },
    "bundle.js.map": { hash },

    // Static files for the plyr media player.
    "blank.mp4": { hash },
    "plyr.svg": { hash },

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
}

impl Assets {
    pub(crate) async fn init(config: &Config) -> Result<Self> {
        let mut path_overrides = HashMap::new();
        path_overrides.insert("logo-large.svg".into(), config.theme.logo.large.path.clone());
        path_overrides.insert("logo-small.svg".into(), config.theme.logo.small.path.clone());
        if let Some(fonts_css) = &config.theme.fonts {
            path_overrides.insert("fonts.css".into(), fonts_css.into());
        }

        let mut variables = <HashMap<String, String>>::new();
        variables.insert("theme-json".into(), build_theme(&config.theme));
        variables.insert("auth".into(), json!({
            "loginLink": config.auth.login_link,
            "userIdLabel": config.auth.login_page.user_id_label,
            "passwordLabel": config.auth.login_page.password_label,
            "loginPageNote": config.auth.login_page.note,
        }).to_string());
        variables.insert("site-title".into(), config.general.site_title.clone());
        variables.insert("logo-margin".into(), config.theme.logo.margin.to_string());
        variables.insert(
            "large-logo-resolution".into(),
            format!("{:?}", config.theme.logo.large.resolution),
        );
        variables.insert(
            "small-logo-resolution".into(),
            format!("{:?}", config.theme.logo.small.resolution),
        );

        let reinda_config = reinda::Config {
            base_path: if cfg!(debug_assertions) {
                Some("../frontend/build".into())
            } else {
                None
            },
            path_overrides,
            variables,
        };

        let assets = reinda::Assets::new(ASSETS, reinda_config).await
            .context("failed to prepare asset files")?;
        info!("Prepared {} assets", assets.asset_ids().count());

        Ok(Self { assets } )
    }

    /// Responds with the asset identified by the given path. If there exists no
    /// asset with `path` or `path` is `INDEX_FILE`, `None` is returned.
    pub(crate) async fn serve(&self, path: &str) -> Option<Response> {
        // The `index.html` here is not intended to be served directly. It is
        // modified and sent on many other routes.
        if path == INDEX_FILE {
            return None;
        }

        let data = self.assets.get(path).await.unwrap_or_else(|e| {
            panic!("failed to read asset '{}': {}", path, e);
        })?;

        // Prepare HTTP headers
        let mut builder = Response::builder();
        builder = builder.header("content-length", data.len());

        // Mime type
        let mime_guess = mime_guess::from_path(path).first();
        if let Some(mime) = mime_guess {
            builder = builder.header("content-type", mime.to_string())
        }

        // Caching header if the filename contains a content hash. We can unwrap
        // the `lookup` call as we know from above that the path is valid.
        if self.assets.asset_info(self.assets.lookup(path).unwrap()).is_filename_hashed() {
            // This is one year in seconds.
            builder = builder.header("cache-control", "public, max-age=31536000, immutable");
        }

        let body = Body::from(data);
        Some(builder.body(body).expect("bug: invalid response"))
    }

    pub(crate) async fn index(&self) -> Body {
        // We treat the `index.html` missing as internal server error. We are
        // not a general file server. We require this index file to function.
        self.assets.get(INDEX_FILE).await
            .expect("failed to read 'index.html'")
            .expect("`index.html` missing in internal assets")
            .into()
    }

    /// Serves the main entry point of the application. This is replied to `/`
    /// and other "public routes", like `/lectures`. Basically everywhere where
    /// the user is supposed to see the website.
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

// TODO: this function doesn't quite fit into this module, move it somewhere else.
fn build_theme(theme: &ThemeConfig) -> String {
    json!({
        "logoMargin": theme.logo.margin,
        "headerHeight": theme.header_height,
        "color": {
            "navigation": theme.color.navigation,
            "accent": theme.color.accent,
            "grey50": theme.color.grey50,
            "danger": theme.color.danger,
            "happy": theme.color.happy,
        },
    }).to_string()
}
