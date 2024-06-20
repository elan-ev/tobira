use bstr::ByteSlice;
use hyper::StatusCode;
use reinda::Embeds;
use secrecy::ExposeSecret;
use serde_json::json;

use crate::{auth::AuthSource, config::{Config, LogoDef}, prelude::*, util::ByteBody};
use super::{handlers::CommonHeadersExt, Response};


const EMBEDS: Embeds = reinda::embed! {
    base_path: "../frontend/build",
    print_stats: true,
    files: [
        "index.html",
        "bundle.*.js",
        "bundle.*.js.map",

        "1x1-black.png",

        // Fonts files
        "fonts.css",
        "fonts/*.woff2",

        // Paella
        "paella/icons/*.svg",
        "paella/theme.css",
        "paella/theme.json",
    ],
};

const INDEX_FILE: &str = "index.html";
const FAVICON_FILE: &str = "favicon.svg";
const FONTS_CSS_FILE: &str = "fonts.css";

pub(crate) struct Assets {
    assets: reinda::Assets,
}

impl Assets {
    pub(crate) async fn init(config: &Config) -> Result<Self> {
        // Iterator over all defined logos, with their (config_field, http_path, fs_path).
        //
        // TODO: adjust file extension according to actual file path, to avoid
        // PNG files being served as `.svg`.
        let logo_files = || [
            ("large", "logo-large.svg", Some(&config.theme.logo.large)),
            ("small", "logo-small.svg", config.theme.logo.small.as_ref()),
            ("largeDark", "logo-large-dark.svg", config.theme.logo.large_dark.as_ref()),
            ("smallDark", "logo-small-dark.svg", config.theme.logo.small_dark.as_ref()),
        ].into_iter().filter_map(|(config_field, http_path, logo)| {
            logo.map(|logo| (config_field, http_path, &logo.path))
        });


        let mut builder = reinda::Assets::builder();

        // Add logo & favicon files
        builder.add_file(FAVICON_FILE, &config.theme.favicon).with_hash();
        for (_, http_path, logo_path) in logo_files() {
            builder.add_file(http_path, logo_path).with_hash();
        }


        // ----- Main HTML file -----------------------------------------------------
        //
        // We use a "modifier" to adjust the file, including the frontend
        // config, and in particular: refer to the correct paths (which are
        // potentially hashed). We also insert other variables and code.
        let deps = [FAVICON_FILE, FONTS_CSS_FILE]
            .into_iter()
            .chain(logo_files().map(|(_, http_path, _)| http_path));

        builder.add_embedded(INDEX_FILE, &EMBEDS[INDEX_FILE]).with_modifier(deps, {
            let frontend_config = frontend_config(config);
            let html_title = config.general.site_title.en().to_owned();
            let global_style = config.theme.to_css();
            let matomo_code = config.matomo.js_code().unwrap_or_default();
            let logo_paths = logo_files()
                .map(|(config_field, http_path, _)| (config_field, http_path))
                .collect::<Vec<_>>();

            move |original, ctx| {
                // Fill logo path in frontend config and convert it to string.
                let mut frontend_config = frontend_config.clone();
                for (config_field, http_path) in &logo_paths {
                    let actual_path = format!("/~assets/{}", ctx.resolve_path(http_path));
                    frontend_config["logo"][config_field]["path"] = json!(actual_path);
                }
                let frontend_config = if cfg!(debug_assertions) {
                    serde_json::to_string_pretty(&frontend_config).unwrap()
                } else {
                    serde_json::to_string(&frontend_config).unwrap()
                };

                reinda::util::replace_many(&original, &[
                    ("{{ frontendConfig }}", frontend_config.as_str()),
                    ("{{ htmlTitle }}", html_title.as_str()),
                    ("{{ globalStyle }}", global_style.as_str()),
                    ("{{ matomoCode }}", matomo_code.as_str()),
                    ("{{ faviconPath }}", ctx.resolve_path(FAVICON_FILE)),
                    ("{{ fontCssPath }}", ctx.resolve_path(FONTS_CSS_FILE)),
                ]).into()
            }
        });


        // ----- Fonts --------------------------------------------------------------
        //
        // This is also a bit involved to support custom fonts. We have to
        // include all font files, which is easy. But then the `fonts.css`
        // needs to be adjusted to insert hashed paths and also set the
        // `--main-font` correctly.
        let extra_fonts = config.theme.font.files.iter().map(|path| {
            // Build the HTTP path of custom fonts using their filename.
            let filename = path.file_name()
                .expect("path in `theme.font.files` has no filename")
                .to_str()
                .expect("filename in `theme.font.files` should be valid UTF-8");
            let http_path = format!("fonts/{filename}");
            (http_path, path)
        }).collect::<Vec<_>>();

        let mut font_paths = builder.add_embedded("fonts/open-sans/", &EMBEDS["fonts/*.woff2"])
            .with_hash()
            .http_paths();
        for (http_path, font_path) in extra_fonts {
            builder.add_file(http_path.clone(), font_path).with_hash();
            font_paths.push(http_path.into());
        }

        builder.add_embedded(FONTS_CSS_FILE, &EMBEDS[FONTS_CSS_FILE])
            .with_hash()
            .with_modifier(font_paths.clone(), {
                // Load extra CSS
                let extra_css = if let Some(path) = &config.theme.font.extra_css {
                    tokio::fs::read(path).await
                        .context("failed to read 'theme.font.extra_css'")?
                } else {
                    Vec::new()
                };
                let main_family = config.theme.font.main_family.clone();

                move |original, ctx| {
                    let mut v = Vec::from(original);
                    v.extend_from_slice(&extra_css);
                    reinda::util::replace_many_with(
                        &v,
                        ctx.dependencies().iter()
                            .map(|c| c.as_ref())
                            .chain(["{{ main_family }}"]),
                        |idx, find, out| {
                            let replacement = if find == b"{{ main_family }}" {
                                &main_family
                            } else {
                                ctx.resolve_path(ctx.dependencies()[idx].as_ref())
                            };
                            out.extend_from_slice(replacement.as_bytes());
                        }
                    ).into()
                }
            });


        // ----------------------------------------------------------------------------
        // JS bundle
        builder.add_embedded("", &EMBEDS["bundle.*.js"]);
        builder.add_embedded("", &EMBEDS["bundle.*.js.map"]);

        // Paella assets: no hashing as Paella requests these fixed paths.
        builder.add_embedded("1x1-black.png", &EMBEDS["1x1-black.png"]);
        builder.add_embedded("paella/icons/", &EMBEDS["paella/icons/*.svg"]);
        builder.add_embedded("paella/theme.css", &EMBEDS["paella/theme.css"]);
        builder.add_embedded("paella/theme.json", &EMBEDS["paella/theme.json"]);


        // Prepare all assets
        let assets = builder.build().await?;
        info!("Prepared {} assets", assets.len());
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

        let asset = self.assets.get(path)?;
        let data = asset.content().await.unwrap_or_else(|e| {
            panic!("failed to read asset '{}': {}", path, e);
        });

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
        if asset.is_filename_hashed() {
            // This is one year in seconds.
            builder = builder.header("cache-control", "public, max-age=31536000, immutable");
        }

        let body = ByteBody::new(data);
        Some(builder.body(body).expect("bug: invalid response"))
    }

    /// Serves the main entry point of the application. This is replied to `/`
    /// and other "public routes", like `/lectures`. Basically everywhere where
    /// the user is supposed to see the website.
    pub(crate) async fn serve_index(&self, status: StatusCode, config: &Config) -> Response {
        let bytes = self.assets.get(INDEX_FILE)
            .expect("`index.html` missing in internal assets")
            .content()
            .await
            .expect("failed to read 'index.html'");

        // Generate nonce and put it into the HTML response.
        //
        // TODO: we could, in the asset preparation, replace `{{ nonce }}` with
        // a placeholder that is exactly as wide as the hex string we will
        // insert as nonce. Then we could replace without heap allocations.
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

fn frontend_config(config: &Config) -> serde_json::Value {
    let logo_obj = |logo_def: &LogoDef| json!({
        // The path will be added later in the modifier
        "path": "",
        "resolution": logo_def.resolution,
    });

    json!({
        "version": {
            "identifier": crate::version::identifier(),
            "buildDateUtc": crate::version::build_time_utc(),
            "gitCommitHash": crate::version::git_commit_hash(),
            "gitWasDirty": crate::version::git_was_dirty(),
            "target": crate::version::target(),
        },
        "auth": {
            "usesTobiraSessions": config.auth.source == AuthSource::TobiraSession,
            "loginLink": config.auth.login_link,
            "logoutLink": config.auth.logout_link,
            "userIdLabel": config.auth.login_page.user_id_label,
            "passwordLabel": config.auth.login_page.password_label,
            "loginPageNote": config.auth.login_page.note,
            "preAuthExternalLinks": config.auth.pre_auth_external_links,
            "userRolePrefixes": config.auth.roles.user_role_prefixes,
            "globalPageAdminRole": config.auth.roles.global_page_admin,
            "globalPageModeratorRole": config.auth.roles.global_page_moderator,
        },
        "upload": {
            "requireSeries": config.upload.require_series,
        },
        "siteTitle": config.general.site_title,
        "initialConsent": config.general.initial_consent,
        "showDownloadButton": config.general.show_download_button,
        "usersSearchable": config.general.users_searchable,
        "footerLinks": config.general.footer_links,
        "metadataLabels": config.general.metadata,
        "paellaPluginConfig": config.player.paella_plugin_config,
        "opencast": {
            "presentationNode": config.opencast.sync_node().to_string(),
            "uploadNode": config.opencast.upload_node().to_string(),
            "studioUrl": config.opencast.studio_url().to_string(),
            "editorUrl": config.opencast.editor_url().to_string(),
        },
        "logo": {
            "large": logo_obj(&config.theme.logo.large),
            "small": config.theme.logo.small.as_ref().map(logo_obj),
            "largeDark": config.theme.logo.large_dark.as_ref().map(logo_obj),
            "smallDark": config.theme.logo.small_dark.as_ref().map(logo_obj),
        },
        "sync": {
            "pollPeriod": config.sync.poll_period.as_secs_f64(),
        },
    })
}
