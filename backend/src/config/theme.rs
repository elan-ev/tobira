use std::{path::PathBuf, fmt};

use super::color::ColorConfig;


#[derive(Debug, confique::Config)]
pub(crate) struct ThemeConfig {
    /// Height of the header. Increasing this size only enlarges the logo, the
    /// other elements stay the same size and centered.
    #[config(default = 85)]
    pub(crate) header_height: u32,

    /// Logo used in the top left corner of the page. Using SVG logos is recommended.
    /// See the documentation on theming/logos for more info!
    #[config(nested)]
    pub(crate) logo: LogoConfig,

    /// Path to an SVG file that is used as favicon.
    pub(crate) favicon: PathBuf,

    /// Colors used in the UI. Specified in sRGB.
    #[config(nested)]
    pub(crate) color: ColorConfig,

    #[config(nested)]
    pub(crate) font: FontConfig,
}


#[derive(Debug, confique::Config)]
pub(crate) struct LogoConfig {
    /// The normal, usually wide logo that is shown on desktop screens. The
    /// value is a map with a `path` and `resolution` key:
    ///
    ///     large = { path = "logo.svg", resolution = [20, 8] }
    ///
    /// The resolution is only an aspect ratio. It is used to avoid layout
    /// shifts in the frontend by allocating the correct size for the logo
    /// before the browser loaded the file.
    pub(crate) large: LogoDef,

    /// A less wide logo used for narrow screens.
    pub(crate) small: Option<LogoDef>,
    
    /// Large logo for dark mode usage.
    pub(crate) large_dark: Option<LogoDef>,

    /// Small logo for dark mode usage.
    pub(crate) small_dark: Option<LogoDef>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub(crate) struct LogoDef {
    pub(crate) path: PathBuf,
    pub(crate) resolution: LogoResolution,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct LogoResolution(pub(crate) [u32; 2]);

impl fmt::Debug for LogoResolution {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [w, h] = self.0;
        write!(f, "{}x{}", w, h)
    }
}

#[derive(Debug, confique::Config)]
pub(crate) struct FontConfig {
    /// The main font family to use in Tobira. Needs to be a valid CSS value for
    /// `font-family`.
    #[config(default = "'Open Sans'")]
    pub(crate) main_family: String,

    /// Path to a CSS file with extra `@font-face` declarations. If you want to
    /// refer to files included via `font_files` (see below), be sure to to
    /// include the full path, e.g. `/~assets/fonts/vollkorn-400.woff2`. That's
    /// required as the font files are served with a hashed filename for
    /// caching and Tobira needs to fix up the path in your CSS.
    pub(crate) extra_css: Option<PathBuf>,

    /// Additional font files to serve under `/~assets/fonts/`. Prefer using the
    /// WOFF 2.0 format: it has excellent browser support and great compression.
    #[config(default = [])]
    pub(crate) files: Vec<PathBuf>,
}

impl ThemeConfig {
    /// Returns a string containing CSS that sets lots of variables on the
    /// `:root` element.
    pub(crate) fn to_css(&self) -> String {
        let mut out = String::new();

        // Helper macros
        use std::fmt::Write;
        macro_rules! w {
            ($fmt:literal $($t:tt)*) => {{
                writeln!(out, concat!("      ", $fmt) $($t)*).unwrap();
            }}
        }


        let (light, dark, global) = self.color.css_vars();

        out.push_str(":root {\n");
        w!("  --header-height: {}px;", self.header_height);
        for (key, value) in global {
            w!("  {}: {};", key, value);
        }
        w!("}}");


        w!("html[data-color-scheme=\"light\"], html:not([data-color-scheme]) {{");
        for (key, value) in light {
            w!("  {}: {};", key, value);
        }
        w!("  color-scheme: light;");
        w!("}}");

        w!("html[data-color-scheme=\"dark\"] {{");
        for (key, value) in dark {
            w!("  {}: {};", key, value);
        }
        w!("  color-scheme: dark;");
        w!("}}");


        out
    }
}
