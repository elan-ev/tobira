use std::collections::HashMap;

use bstr::ByteSlice;
use hyper::{Body, StatusCode};
use reinda::{assets, Setup};
use secrecy::ExposeSecret;
use serde_json::json;

use crate::{config::Config, prelude::*};
use super::{Response, handlers::CommonHeadersExt};


const ASSETS: Setup = assets! {
    #![base_path = "../frontend/build"]

    "index.html": { template },
    "main.bundle.js": {
        template,
        hash,
        append: b"//# sourceMappingURL=/~assets/{{: path:main.bundle.js.map :}}"
    },
    "main.bundle.js.map": { hash },

    "logo-large.svg": { hash, dynamic },
    "logo-small.svg": { hash, dynamic },
    "logo-large-dark.svg": { hash, dynamic },
    "logo-small-dark.svg": { hash, dynamic },
    "favicon.svg": { hash, dynamic },

    "fonts.css": { hash, template },

    "1x1-black.png": {},

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

    // Paella
    "paella/icons/backward.svg": {},
    "paella/icons/captions-icon.svg": {},
    "paella/icons/close.svg": {},
    "paella/icons/forward.svg": {},
    "paella/icons/fullscreen-exit.svg": {},
    "paella/icons/fullscreen-icon.svg": {},
    "paella/icons/maximize.svg": {},
    "paella/icons/minimize.svg": {},
    "paella/icons/play.svg": {},
    "paella/icons/slide-next-icon.svg": {},
    "paella/icons/slide-prev-icon.svg": {},
    "paella/icons/slides-icon.svg": {},
    "paella/icons/view-mode.svg": {},
    "paella/icons/volume-high.svg": {},
    "paella/icons/volume-low.svg": {},
    "paella/icons/volume-mid.svg": {},
    "paella/icons/volume-mute-cross.svg": {},
    "paella/icons/volume-mute.svg": {},
    "paella/Roboto-Regular.ttf": {},
    "paella/theme.css": {},
    "paella/theme.json": {},

};

const INDEX_FILE: &str = "index.html";

pub(crate) struct Assets {
    assets: reinda::Assets,
}

impl Assets {
    pub(crate) async fn init(config: &Config) -> Result<Self> {
        let mut path_overrides = HashMap::new();
        let small_logo = config.theme.logo.small.as_ref().unwrap_or(&config.theme.logo.large);
        let large_logo_dark = config.theme.logo.large_dark.as_ref().unwrap_or(&config.theme.logo.large);
        let small_logo_dark = config.theme.logo.small_dark.as_ref()
            .or(config.theme.logo.large_dark.as_ref())
            .or(config.theme.logo.small.as_ref())
            .unwrap_or(&config.theme.logo.large);
        path_overrides.insert("logo-large.svg".into(), config.theme.logo.large.path.clone());
        path_overrides.insert("logo-large-dark.svg".into(), large_logo_dark.path.clone());
        path_overrides.insert("logo-small.svg".into(), small_logo.path.clone());
        path_overrides.insert("logo-small-dark.svg".into(), small_logo_dark.path.clone());
        path_overrides.insert("favicon.svg".into(), config.theme.favicon.clone());

        let mut variables = <HashMap<String, String>>::new();
        let invert_large_dark_logo = config.theme.logo.large_dark.is_none();
        let invert_small_dark_logo = config.theme.logo.small_dark.is_none()
            && invert_large_dark_logo;
        variables.insert("invertLargeDarkLogo".into(), invert_large_dark_logo.to_string());
        variables.insert("invertSmallDarkLogo".into(), invert_small_dark_logo.to_string());
        variables.insert("version".into(), json!({
            "identifier": crate::version::identifier(),
            "buildDateUtc": crate::version::build_time_utc(),
            "gitCommitHash": crate::version::git_commit_hash(),
            "gitWasDirty": crate::version::git_was_dirty(),
            "target": crate::version::target(),
        }).to_string());
        variables.insert("global-style".into(), config.theme.to_css());
        variables.insert("auth".into(), json!({
            "loginLink": config.auth.login_link,
            "logoutLink": config.auth.logout_link,
            "userIdLabel": config.auth.login_page.user_id_label,
            "passwordLabel": config.auth.login_page.password_label,
            "loginPageNote": config.auth.login_page.note,
            "preAuthExternalLinks": config.auth.pre_auth_external_links,
            "userRolePrefixes": config.auth.user_role_prefixes,
        }).to_string());
        variables.insert("upload".into(), json!({
            "requireSeries": config.upload.require_series,
        }).to_string());

        // Note the mismatch between presentation and sync node;
        // these might not be the same forever!
        variables.insert("presentation-node".into(), config.opencast.sync_node().to_string());
        variables.insert("upload-node".into(), config.opencast.upload_node().to_string());
        variables.insert("studio-url".into(), config.opencast.studio_url().to_string());
        variables.insert("editor-url".into(), config.opencast.editor_url().to_string());

        variables.insert("html-title".into(), config.general.site_title.en().into());
        variables.insert("site-title".into(), config.general.site_title.to_json());
        variables.insert("initial-consent".into(), json!(config.general.initial_consent).to_string());
        variables.insert("show-download-button".into(), json!(config.general.show_download_button).to_string());
        variables.insert("users-searchable".into(), json!(config.general.users_searchable).to_string());
        variables.insert("footer-links".into(), json!(config.general.footer_links).to_string());
        variables.insert("metadata-labels".into(), json!(config.general.metadata).to_string());
        variables.insert(
            "large-logo-resolution".into(),
            format!("{:?}", config.theme.logo.large.resolution.0),
        );
        variables.insert(
            "small-logo-resolution".into(),
            format!("{:?}", small_logo.resolution.0),
        );
        variables.insert(
            "large-dark-logo-resolution".into(),
            format!("{:?}", large_logo_dark.resolution.0),
        );
        variables.insert(
            "small-dark-logo-resolution".into(),
            format!("{:?}", small_logo_dark.resolution.0),
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

    /// Serves the main entry point of the application. This is replied to `/`
    /// and other "public routes", like `/lectures`. Basically everywhere where
    /// the user is supposed to see the website.
    pub(crate) async fn serve_index(&self, status: StatusCode, config: &Config) -> Response {
        let bytes = self.assets.get(INDEX_FILE).await
            .expect("failed to read 'index.html'")
            .expect("`index.html` missing in internal assets");

        // Generate nonce and put it into the HTML response.
        let nonce_bytes = crate::util::gen_random_bytes_crypto::<16>();
        let nonce = hex::encode(&nonce_bytes.expose_secret());
        let body = bytes.replace("{{ nonce }}", &nonce);

        // Build response
        Response::builder()
            .status(status)
            .header("Content-Type", "text/html; charset=UTF-8")
            .with_content_security_policies(config, &nonce)
            .body(body.into())
            .expect("bug: invalid response")
    }
}
